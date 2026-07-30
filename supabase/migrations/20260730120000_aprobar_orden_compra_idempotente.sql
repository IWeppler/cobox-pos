-- Guard de idempotencia en la aprobación de remitos.
--
-- INCIDENTE (Estilo Bonito, 27/07 22:55 hora Argentina): la orden
-- `da48159a` (217 líneas) quedó con stock = cantidad_del_remito × 8 en 204
-- variantes — 1960 unidades donde correspondían 245. Causa: el timeout de
-- UI era 25s y el loop de aprobación tardaba 75-200s. `withTimeout` solo
-- rechaza la promesa del cliente; el server action seguía hasta el final.
-- Cada intento mostraba error, destrababa el botón, y volvía a sumar el
-- stock completo. Ocho apretadas = ocho aplicaciones.
--
-- La versión batch (20260728120000) arregló la velocidad y la atomicidad,
-- pero NO la idempotencia: `update ordenes_compra set estado='APROBADA'
-- where id = p_orden_id` sin condición sobre el estado. Aprobar dos veces
-- la misma orden seguía sumando dos veces.
--
-- Mismo bug que ya apareció en cancel-sale.ts (reembolso fantasma por no
-- chequear filas afectadas antes de generar el efecto secundario), otra
-- tabla: el patrón es UPDATE condicional + chequeo de filas afectadas
-- ANTES de cualquier escritura derivada.
--
-- Dos detalles que hacen que esto funcione de verdad:
--
--   * El guard va PRIMERO, no al final. Si fuera al final, la corrida
--     repetida ya habría sumado el stock y habría que confiar en el
--     rollback; poniéndolo antes, el camino "ya aprobada" no escribe nada
--     en ningún momento.
--   * El UPDATE toma el row lock de la orden. Dos llamadas concurrentes
--     (doble click, o dos pestañas) se serializan: la segunda espera el
--     commit de la primera, re-evalúa el WHERE bajo READ COMMITTED, ve
--     estado='APROBADA' y sale por el camino idempotente. Un `select ...
--     where estado <> 'APROBADA'` previo NO daría esa garantía: las dos
--     leerían PENDIENTE y las dos sumarían.
--
-- "Ya aprobada" vuelve como resultado normal (`ya_aprobada: true`), no
-- como excepción: no hay nada que rollbackear y el cliente necesita
-- distinguirlo de un error real para no ofrecer "Reintentar". Orden
-- inexistente (o invisible por RLS) sí sigue siendo excepción.

create or replace function aprobar_orden_compra(
  p_orden_id uuid,
  p_proveedor text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_producto_id uuid;
  v_raw_nombre text;
  v_estado_match text;
  v_variante text;
  v_atributos jsonb;
  v_sku text;
  v_cantidad integer;
  v_precio_costo numeric;
  v_precio_venta numeric;
  v_precio_base numeric;
  v_difiere_precio boolean;
  v_alias_key text;

  v_variante_id uuid;
  v_stock_id uuid;
  v_estado_actual text;

  -- Espejo de los Sets de control que tenía la versión en Node.
  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
  -- producto_id (texto) -> precio base efectivamente escrito a nivel
  -- producto. Lo fija el PRIMER ítem de ese producto, igual que antes.
  v_precio_base_por_producto jsonb := '{}'::jsonb;

  v_lineas integer := 0;
  v_variantes_creadas integer := 0;
begin
  -- GUARD DE IDEMPOTENCIA. Antes del loop: si esta orden ya estaba
  -- aprobada, se sale sin haber tocado stock ni precios ni alias.
  update ordenes_compra
  set estado = 'APROBADA'
  where id = p_orden_id
    and estado <> 'APROBADA';

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
      'alias_registrados', 0
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    if v_producto_id is null then
      continue;
    end if;

    v_raw_nombre   := coalesce(v_item->>'raw_nombre', '');
    v_estado_match := v_item->>'estado_match';
    v_variante     := coalesce(nullif(v_item->>'variante', ''), 'Unico');
    v_atributos    := coalesce(v_item->'atributos', '{}'::jsonb);
    v_sku          := nullif(trim(coalesce(v_item->>'sku', '')), '');
    v_cantidad     := coalesce((v_item->>'cantidad')::integer, 0);
    v_precio_costo := nullif(v_item->>'precio_costo', '')::numeric;
    v_precio_venta := nullif(v_item->>'precio_venta_actualizado', '')::numeric;

    -- 1. Precios: una sola vez por producto, aunque tenga 10 variantes.
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

    -- 2. Stock: por CADA línea. Dos líneas del mismo producto+variante
    --    tienen que sumar, no pisarse.
    select id into v_variante_id
    from producto_variantes
    where producto_id = v_producto_id
      and nombre_display = v_variante
    limit 1;

    if v_variante_id is not null then
      update producto_variantes
      set
        stock = stock + v_cantidad,
        atributos = v_atributos,
        -- Solo pisa el SKU si este remito trajo uno — un reingreso sin
        -- columna SKU no debe blanquear el que ya estaba cargado.
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
      );

      v_variantes_creadas := v_variantes_creadas + 1;
    end if;

    -- Espejo legacy productos_stock: se mantiene sincronizado, y su texto
    -- de variante NUNCA se normaliza.
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

    -- 3. Diccionario de alias: una sola vez por nombre crudo.
    if v_estado_match in ('DESCONOCIDO', 'NUEVO_ALIAS') then
      v_alias_key := lower(trim(v_raw_nombre));
      if not (v_alias_key = any (v_alias_registrados)) then
        insert into diccionario_alias (proveedor, raw_nombre, producto_id)
        values (p_proveedor, v_alias_key, v_producto_id)
        on conflict (proveedor, raw_nombre)
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
    'alias_registrados', coalesce(array_length(v_alias_registrados, 1), 0)
  );
end;
$$;

comment on function aprobar_orden_compra(uuid, text, jsonb) is
  'Impacta una orden de compra completa (precios + stock + alias) en una '
  'sola transacción, una sola vez: el guard de idempotencia sobre '
  'ordenes_compra.estado corre ANTES de escribir stock y toma el row lock '
  'que serializa dos aprobaciones concurrentes. Si la orden ya estaba '
  'aprobada devuelve {ya_aprobada: true} sin tocar nada. Recibe atributos '
  'YA canonicalizados desde Node.';
