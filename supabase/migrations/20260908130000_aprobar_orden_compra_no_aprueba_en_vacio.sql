-- ---------------------------------------------------------------------------
-- Un remito no puede quedar APROBADA sin haber impactado nada.
--
-- LO QUE PASABA. `aprobar_orden_compra_impl` marca `estado = 'APROBADA'` antes
-- del loop, y adentro hace `continue` en cada línea sin `producto_id`. O sea
-- que un remito cuyas líneas no se vincularon a ningún producto se marcaba
-- aprobado igual, sin sumar una sola unidad — y después el propio guard de
-- idempotencia (`where estado <> 'APROBADA'`) impedía reintentarlo. Para
-- recuperar ese stock había que volver a subir el archivo.
--
-- No es hipotético: el único remito de proveedor de ClickTostado (11 líneas de
-- celulares, agosto 2026) está APROBADA con las 11 líneas en `producto_id
-- null`. Nunca entró nada, y nadie recibió un error.
--
-- La pantalla de conciliación ya exige tener todo vinculado antes de dejar
-- apretar el botón, pero eso es validación de navegador: un server action es
-- un endpoint, y el payload que llega acá ya viene filtrado por
-- `aprobarOrdenAction`, que descarta las líneas sin producto. Justamente por
-- eso el guard no puede mirar SOLO el payload — tiene que mirar la orden.
--
-- DOS CHEQUEOS, los dos antes de escribir:
--
--   1. El payload no trae ninguna línea impactable. Aprobar eso es marcar
--      hecho algo que no se hizo.
--   2. La orden tiene líneas sin `producto_id`. Esas líneas se perderían en
--      silencio: la orden quedaría aprobada y esa mercadería no existiría en
--      el sistema. Es la misma regla que ya aplica la pantalla, ahora en el
--      único lugar donde no se puede saltear.
--
-- Van DESPUÉS del guard de fusión de `20260908120000` y antes del update de
-- estado, en el mismo bloque de validaciones. El resto del cuerpo no cambia y
-- se copia del cuerpo VIVO, no de un archivo (lección de `20260904140000`).
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
  v_cantidad numeric(12,3);
  v_precio_costo numeric;
  v_precio_venta numeric;
  v_precio_base numeric;
  v_difiere_precio boolean;
  v_alias_key text;
  v_negocio_id uuid;

  v_variante_id uuid;
  v_nombre_variante text;
  v_identidad text;
  v_stock_id uuid;
  v_estado_actual text;
  v_colisiones text;
  v_impactables integer;
  v_sin_producto integer;

  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
  v_precio_base_por_producto jsonb := '{}'::jsonb;

  v_lineas integer := 0;
  v_variantes_creadas integer := 0;
  v_imeis_creados integer := 0;
begin
  -- GUARD DE FUSION: va primero, antes de cualquier escritura.
  with lineas as (
    select
      nullif(it->>'producto_id', '')::uuid as producto_id,
      lower(trim(coalesce(nullif(it->>'raw_nombre', ''), '(sin nombre)'))) as raw_nombre,
      coalesce(
        nullif(public.atributos_comparables(coalesce(it->'atributos', '{}'::jsonb)), ''),
        'display:' || lower(trim(coalesce(nullif(it->>'variante', ''), 'Unico')))
      ) as identidad
    from jsonb_array_elements(p_items) as it
    where nullif(it->>'producto_id', '') is not null
  ),
  choques as (
    select
      l.producto_id,
      l.identidad,
      string_agg(distinct l.raw_nombre, ' + ' order by l.raw_nombre) as nombres
    from lineas l
    group by l.producto_id, l.identidad
    having count(distinct l.raw_nombre) > 1
  )
  select string_agg(
           coalesce(p.nombre, c.producto_id::text) || ' (' || c.nombres || ')',
           '; '
         )
    into v_colisiones
  from choques c
  left join productos p on p.id = c.producto_id;

  if v_colisiones is not null then
    raise exception
      'REMITO_VARIANTE_COLISION: hay renglones de productos distintos que caen en la misma variante: %',
      v_colisiones
      using errcode = 'P0001';
  end if;

  -- GUARD DE APROBACION EN VACIO.
  select count(*)
    into v_impactables
  from jsonb_array_elements(p_items) as it
  where nullif(it->>'producto_id', '') is not null;

  if v_impactables = 0 then
    raise exception
      'REMITO_SIN_LINEAS_IMPACTABLES: ninguna linea del remito esta vinculada a un producto, no hay nada que impactar'
      using errcode = 'P0001';
  end if;

  select count(*)
    into v_sin_producto
  from ordenes_items oi
  where oi.orden_id = p_orden_id
    and oi.producto_id is null
    and not exists (
      select 1
      from jsonb_array_elements(p_items) as it
      where nullif(it->>'item_id', '')::uuid = oi.id
        and nullif(it->>'producto_id', '') is not null
    );

  if v_sin_producto > 0 then
    raise exception
      'REMITO_LINEAS_SIN_PRODUCTO: % renglon(es) del remito no estan vinculados a ningun producto; se perderian al aprobar',
      v_sin_producto
      using errcode = 'P0001';
  end if;

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
    v_cantidad     := coalesce((v_item->>'cantidad')::numeric, 0);
    v_precio_costo := nullif(v_item->>'precio_costo', '')::numeric;
    v_precio_venta := nullif(v_item->>'precio_venta_actualizado', '')::numeric;

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

    -- IDENTIDAD DE LA VARIANTE: misma expresion que idx_variante_identidad.
    v_identidad := public.atributos_comparables(v_atributos);
    v_variante_id := null;
    v_nombre_variante := null;

    if v_identidad = '' then
      select id, nombre_display into v_variante_id, v_nombre_variante
      from producto_variantes
      where producto_id = v_producto_id
        and nombre_display = v_variante
      limit 1;
    else
      select id, nombre_display into v_variante_id, v_nombre_variante
      from producto_variantes
      where producto_id = v_producto_id
        and public.atributos_comparables(atributos) = v_identidad
      limit 1;

      if v_variante_id is null then
        -- Variantes viejas sin atributos: se reconocen por nombre y el update
        -- de abajo se los completa.
        select id, nombre_display into v_variante_id, v_nombre_variante
        from producto_variantes
        where producto_id = v_producto_id
          and nombre_display = v_variante
          and public.atributos_comparables(atributos) = ''
        limit 1;
      end if;
    end if;

    if v_variante_id is not null then
      update producto_variantes
      set
        stock = stock + v_cantidad,
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

      v_nombre_variante := v_variante;
      v_variantes_creadas := v_variantes_creadas + 1;
    end if;

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

    -- El espejo legacy se mueve con el nombre REAL de la variante tocada.
    v_nombre_variante := coalesce(v_nombre_variante, v_variante);

    select id into v_stock_id
    from productos_stock
    where producto_id = v_producto_id
      and variante = v_nombre_variante
    limit 1;

    if v_stock_id is not null then
      update productos_stock
      set cantidad = cantidad + v_cantidad
      where id = v_stock_id;
    else
      insert into productos_stock (producto_id, variante, cantidad)
      values (v_producto_id, v_nombre_variante, v_cantidad);
    end if;

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
  'Motor de ingreso de mercaderia por remito. Resuelve la variante por atributos_comparables (misma expresion que idx_variante_identidad), rechaza el remito si dos renglones de productos distintos caen en la misma variante, y no marca APROBADA un remito que no impacta nada o que tiene renglones sin producto. Incluye lo que una reescritura completa puede volver a perder: cantidad decimal, atributos que no se pisan con {} y creacion de unidades_serie desde el IMEI.';

-- ---------------------------------------------------------------------------
-- Guards: seis piezas que una reescritura completa no puede perder en silencio.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_def text;
  v_pieza text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'aprobar_orden_compra_impl';

  if v_def is null then
    raise exception 'aprobar_orden_compra_impl no existe';
  end if;

  foreach v_pieza in array array[
    'unidades_serie',
    'producto_variantes.atributos',
    'atributos_comparables',
    'REMITO_VARIANTE_COLISION',
    'REMITO_SIN_LINEAS_IMPACTABLES',
    'REMITO_LINEAS_SIN_PRODUCTO'
  ]
  loop
    if position(v_pieza in v_def) = 0 then
      raise exception 'aprobar_orden_compra_impl quedo sin la pieza: %', v_pieza;
    end if;
  end loop;
end;
$do$;
