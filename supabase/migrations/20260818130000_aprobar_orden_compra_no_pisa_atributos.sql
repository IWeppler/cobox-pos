-- Un `atributos` vacío significa "no sé", no "borralos".
--
-- Hasta acá, cuando la línea del remito matcheaba una variante existente, la
-- RPC hacía `atributos = v_atributos` sin condición. Con la planilla propia
-- —que llegaba con `{}` porque su texto de variante venía sin etiquetas— eso
-- no era un no-op: le BORRABA a la variante ya cargada su talle y su color.
-- La variante quedaba viva y con stock, pero fuera de los filtros del catálogo
-- y del selector del POS, sin ningún error.
--
-- El origen del `{}` se arregla del lado de Node (varianteDesdeAtributos ahora
-- emite "Talle: M / Color: Negro"), pero el freno va igual acá: la RPC es el
-- único motor de escritura de stock por ingreso, y no puede depender de que
-- todos sus llamadores manden los atributos bien. Un dato que falta nunca
-- puede destruir uno que estaba.
--
-- Lo demás no se toca: guard de idempotencia, orden de escrituras, precios,
-- IMEI y espejo legacy quedan idénticos a 20260815110000.
create or replace function public.aprobar_orden_compra(p_orden_id uuid, p_proveedor text, p_items jsonb)
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
  v_cantidad integer;
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
    v_cantidad     := coalesce((v_item->>'cantidad')::integer, 0);
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
        -- ACÁ está el cambio: un payload sin atributos deja los que ya tenía.
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

    -- Número de serie de la línea. `on conflict do nothing` con el mismo
    -- criterio que importar_productos_planilla: un IMEI repetido es la misma
    -- unidad física cargada dos veces, no dos aparatos.
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
