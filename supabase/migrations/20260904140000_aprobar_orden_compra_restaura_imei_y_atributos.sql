-- ---------------------------------------------------------------------------
-- Restaura dos cosas que `aprobar_orden_compra` perdió por una reescritura.
--
-- QUÉ PASÓ. El 18/8, `20260818133834_aprobar_orden_compra_no_pisa_atributos`
-- agregó al motor de ingreso dos comportamientos:
--
--   1. Un `atributos` vacío ya no pisa los de la variante existente. Un
--      payload que llega con `{}` significa "no sé", no "borralos": con la
--      planilla propia le borraba a la variante su talle y su color, y la
--      variante quedaba viva y con stock pero fuera de los filtros del
--      catálogo y del selector del POS, sin ningún error.
--   2. La línea con IMEI crea su fila en `unidades_serie`, que es lo que
--      permite que una planilla de electro entre por conciliación sin perder
--      los números de serie.
--
-- El 19/8, `20260819180039_aprobar_orden_compra_cantidad_decimal` reescribió
-- la función ENTERA para que la cantidad aceptara decimales (12,5 kg de
-- carne), pero la escribió partiendo de una copia anterior al 18/8. Las dos
-- migraciones están aplicadas y ganó la segunda: hoy la función en producción
-- vuelve a pisar los atributos y NO escribe `unidades_serie`.
--
-- Verificado en la base antes de escribir esto: el cuerpo vivo tiene
-- `atributos = v_atributos` sin condición y no menciona `unidades_serie` en
-- ningún lado. Hay 5 líneas de remito con IMEI cargado y 2 filas en
-- `unidades_serie` en toda la base.
--
-- CÓMO SE ARREGLA. Se redefine el cuerpo con las dos piezas del 18/8 MÁS el
-- decimal del 19/8. No se elige entre una y otra: las tres cosas son
-- compatibles y las tres tienen que estar.
--
-- El nombre de la función es `aprobar_orden_compra_impl` porque
-- `20260823182514_movimientos_stock` renombró la original y dejó un wrapper
-- que declara el origen del movimiento. El wrapper NO se toca.
--
-- LECCIÓN, que es la parte que importa más que el arreglo: reescribir una
-- función entera desde una copia guardada en otra migración pierde en
-- silencio todo lo que se le agregó en el medio. `create or replace function`
-- no avisa de nada. Antes de reescribir un cuerpo completo hay que partir del
-- cuerpo VIVO (`pg_get_functiondef`), no del último archivo que lo tocó.
-- ---------------------------------------------------------------------------

create or replace function public.aprobar_orden_compra_impl(
  p_orden_id uuid,
  p_proveedor text,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_producto_id uuid;
  v_item_id uuid;
  v_raw_nombre text;
  v_estado_match text;
  v_variante text;
  v_atributos jsonb;
  v_sku text;
  v_imei text;
  -- numeric(12,3) y no integer: con integer, 12,5 kg de carne no entra
  -- (viene de 20260819180039).
  v_cantidad numeric(12,3);
  v_precio_costo numeric;
  v_precio_venta numeric;
  v_precio_base numeric;
  v_difiere_precio boolean;
  v_alias_key text;
  v_negocio_id uuid;

  v_variante_id uuid;
  v_stock_id uuid;
  v_estado_actual text;

  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
  v_precio_base_por_producto jsonb := '{}'::jsonb;

  -- Estos siguen siendo integer y está bien: cuentan líneas, variantes y
  -- unidades serializadas, no mercadería. Media línea de remito no existe.
  v_lineas integer := 0;
  v_variantes_creadas integer := 0;
  v_imeis_creados integer := 0;
begin
  -- GUARD DE IDEMPOTENCIA. Antes del loop: si esta orden ya estaba aprobada,
  -- se sale sin haber tocado stock ni precios ni alias.
  update ordenes_compra
  set estado = 'APROBADA'
  where id = p_orden_id
    and estado <> 'APROBADA'
  returning negocio_id into v_negocio_id;

  if not found then
    select estado into v_estado_actual
    from ordenes_compra
    where id = p_orden_id;

    if v_estado_actual is null then
      raise exception 'Orden % no encontrada o sin permiso para aprobarla', p_orden_id;
    end if;

    return jsonb_build_object(
      'ya_aprobada', true,
      'lineas_impactadas', 0,
      'productos_actualizados', 0,
      'variantes_creadas', 0,
      'alias_registrados', 0,
      'imeis_creados', 0
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    if v_producto_id is null then
      continue;
    end if;

    v_item_id      := nullif(v_item->>'item_id', '')::uuid;
    v_raw_nombre   := coalesce(v_item->>'raw_nombre', '');
    v_estado_match := v_item->>'estado_match';
    v_variante     := coalesce(nullif(v_item->>'variante', ''), 'Unico');
    v_atributos    := coalesce(v_item->'atributos', '{}'::jsonb);
    v_sku          := nullif(trim(coalesce(v_item->>'sku', '')), '');
    v_imei         := nullif(trim(coalesce(v_item->>'imei', '')), '');
    -- ::numeric y no ::integer: sobre el texto '12.5', integer no redondea,
    -- levanta "invalid input syntax for type integer".
    v_cantidad     := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio_costo := nullif(v_item->>'precio_costo', '')::numeric;
    v_precio_venta := nullif(v_item->>'precio_venta_actualizado', '')::numeric;

    -- A qué producto fue esta línea (ver 20260814230000).
    if v_item_id is not null then
      update ordenes_items
      set producto_id = v_producto_id,
          variante_match = v_variante
      where id = v_item_id;
    end if;

    if not (v_producto_id = any (v_productos_actualizados)) then
      if coalesce(v_precio_costo, 0) <> 0 or coalesce(v_precio_venta, 0) <> 0 then
        update productos
        set
          precio_costo = case
            when coalesce(v_precio_costo, 0) <> 0 then v_precio_costo
            else precio_costo
          end,
          precio = case
            when coalesce(v_precio_venta, 0) <> 0 then v_precio_venta
            else precio
          end
        where id = v_producto_id;
      end if;

      v_productos_actualizados := v_productos_actualizados || v_producto_id;
      v_precio_base_por_producto := v_precio_base_por_producto
        || jsonb_build_object(v_producto_id::text, coalesce(v_precio_venta, 0));
    end if;

    v_precio_base := coalesce(
      (v_precio_base_por_producto->>v_producto_id::text)::numeric,
      0
    );

    select id into v_variante_id
    from producto_variantes
    where producto_id = v_producto_id
      and nombre_display = v_variante
    limit 1;

    if v_variante_id is not null then
      update producto_variantes
      set
        stock = stock + v_cantidad,
        -- RESTAURADO (18/8): un payload sin atributos deja los que ya tenía.
        -- Un dato que falta nunca puede destruir uno que estaba.
        atributos = case
          when v_atributos = '{}'::jsonb then producto_variantes.atributos
          else v_atributos
        end,
        sku = coalesce(v_sku, sku),
        updated_at = now()
      where id = v_variante_id;
    else
      v_difiere_precio := coalesce(v_precio_venta, 0) is distinct from v_precio_base;

      insert into producto_variantes (
        producto_id, nombre_display, atributos, sku, precio, costo, stock
      )
      values (
        v_producto_id,
        v_variante,
        v_atributos,
        v_sku,
        case when v_difiere_precio then v_precio_venta else null end,
        case when v_difiere_precio then v_precio_costo else null end,
        v_cantidad
      )
      returning id into v_variante_id;

      v_variantes_creadas := v_variantes_creadas + 1;
    end if;

    -- RESTAURADO (18/8): número de serie de la línea. `on conflict do nothing`
    -- con el mismo criterio que importar_productos_planilla: un IMEI repetido
    -- es la misma unidad física cargada dos veces, no dos aparatos.
    if v_imei is not null and v_variante_id is not null then
      insert into unidades_serie (negocio_id, producto_variante_id, imei, estado)
      values (
        coalesce(v_negocio_id, security.current_negocio_id()),
        v_variante_id,
        v_imei,
        'disponible'
      )
      on conflict (negocio_id, imei) do nothing;

      if found then
        v_imeis_creados := v_imeis_creados + 1;
      end if;
    end if;

    -- Espejo legacy productos_stock: se mantiene sincronizado, y su texto de
    -- variante NUNCA se normaliza.
    select id into v_stock_id
    from productos_stock
    where producto_id = v_producto_id
      and variante = v_variante
    limit 1;

    if v_stock_id is not null then
      update productos_stock
      set cantidad = cantidad + v_cantidad
      where id = v_stock_id;
    else
      insert into productos_stock (producto_id, variante, cantidad)
      values (v_producto_id, v_variante, v_cantidad);
    end if;

    -- Diccionario de alias: una sola vez por nombre crudo.
    if v_estado_match in ('DESCONOCIDO', 'NUEVO_ALIAS') then
      v_alias_key := lower(trim(v_raw_nombre));
      if not (v_alias_key = any (v_alias_registrados)) then
        insert into diccionario_alias (proveedor, raw_nombre, producto_id)
        values (p_proveedor, v_alias_key, v_producto_id)
        on conflict (negocio_id, proveedor, raw_nombre)
        do update set producto_id = excluded.producto_id;

        v_alias_registrados := v_alias_registrados || v_alias_key;
      end if;
    end if;

    v_lineas := v_lineas + 1;
  end loop;

  return jsonb_build_object(
    'ya_aprobada', false,
    'lineas_impactadas', v_lineas,
    'productos_actualizados', coalesce(array_length(v_productos_actualizados, 1), 0),
    'variantes_creadas', v_variantes_creadas,
    'alias_registrados', coalesce(array_length(v_alias_registrados, 1), 0),
    'imeis_creados', v_imeis_creados
  );
end;
$function$;

comment on function public.aprobar_orden_compra_impl(uuid, text, jsonb) is
  'Motor de ingreso de mercadería por remito. Incluye las tres cosas que se le fueron agregando y que una reescritura completa puede volver a perder: cantidad decimal, atributos que no se pisan con {} y creación de unidades_serie desde el IMEI de la línea.';

-- ---------------------------------------------------------------------------
-- Guard: que la próxima reescritura no vuelva a perderlas en silencio.
--
-- Es el mismo criterio que el guard de `20260816100000` contra las policies
-- con la forma vieja: si el cuerpo vivo no tiene las dos piezas, la migración
-- falla en vez de aplicar y dejar el agujero.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'aprobar_orden_compra_impl';

  if v_def is null then
    raise exception 'aprobar_orden_compra_impl no existe';
  end if;

  if position('unidades_serie' in v_def) = 0 then
    raise exception 'aprobar_orden_compra_impl quedó sin la creación de unidades_serie';
  end if;

  if position('producto_variantes.atributos' in v_def) = 0 then
    raise exception 'aprobar_orden_compra_impl quedó pisando atributos con {}';
  end if;
end;
$do$;
