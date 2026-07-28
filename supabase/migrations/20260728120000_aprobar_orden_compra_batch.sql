-- Conciliación de remitos: aprobar la orden en UNA sola llamada.
--
-- Antes, aprobarOrdenAction (merge-purchase.ts) recorría los ítems con un
-- `for` con `await` adentro: 4 round-trips por línea (select variante,
-- update/insert variante, select stock, update/insert stock) + 1 por
-- producto (precios) + 1 por nombre (alias). Con el remito más grande real
-- (347 líneas / 55 nombres) eso son ~1500 round-trips secuenciales: entre
-- 75 y 200 segundos, que es por qué el timeout de UI había subido de 25s a
-- 300s. Acá el ciclo corre entero dentro de Postgres, en una transacción.
--
-- Además de la velocidad, gana dos cosas de correctitud:
--
--   * El stock se suma con `stock = stock + n` (UPDATE atómico condicional,
--     mismo criterio que ajustar_stock_variante) en vez de leer-modificar-
--     escribir desde Node. Un remito puede repetir producto+variante en dos
--     líneas (pasa en datos reales: CAMISETA ARGENTINA talle 12 y 14, BLUSA
--     GRAN ORIENTE 3XL) y ahí las dos cantidades tienen que sumar.
--   * Si algo falla a mitad de camino, la orden NO queda con la mitad del
--     stock impactado y estado PENDIENTE.
--
-- La canonicalización de atributos NO se replica acá: sigue viviendo en
-- Node (canonicalizarValores / construirCacheAtributos, compartido con la
-- creación manual). Esta función recibe `atributos` ya canonicalizado.
--
-- SECURITY INVOKER a propósito: la acción hoy corre con el cliente de
-- cookies del usuario, así que las RLS de productos / producto_variantes /
-- productos_stock deben seguir gobernando igual que antes.

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

  -- Espejo de los Sets de control que tenía la versión en Node.
  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
  -- producto_id (texto) -> precio base efectivamente escrito a nivel
  -- producto. Lo fija el PRIMER ítem de ese producto, igual que antes.
  v_precio_base_por_producto jsonb := '{}'::jsonb;

  v_lineas integer := 0;
  v_variantes_creadas integer := 0;
begin
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

  update ordenes_compra
  set estado = 'APROBADA'
  where id = p_orden_id;

  if not found then
    raise exception 'Orden % no encontrada o sin permiso para aprobarla', p_orden_id;
  end if;

  return jsonb_build_object(
    'lineas_impactadas', v_lineas,
    'productos_actualizados', array_length(v_productos_actualizados, 1),
    'variantes_creadas', v_variantes_creadas,
    'alias_registrados', array_length(v_alias_registrados, 1)
  );
end;
$$;

comment on function aprobar_orden_compra(uuid, text, jsonb) is
  'Impacta una orden de compra completa (precios + stock + alias) en una '
  'sola transacción. Reemplaza el loop con await por línea de '
  'aprobarOrdenAction. Recibe atributos YA canonicalizados desde Node.';

-- La pantalla de conciliación filtra ordenes_items por orden_id en cada
-- carga y hoy hace Seq Scan sobre toda la tabla.
create index if not exists idx_ordenes_items_orden_id
  on ordenes_items (orden_id);
