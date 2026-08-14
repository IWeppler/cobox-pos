-- Los remitos ahora dejan registrado A QUÉ PRODUCTO fue cada línea.
--
-- El bug: `aprobar_orden_compra` RECIBE el `producto_id` de cada línea (lo
-- resuelve la conciliación en Node), lo usa para mover stock, actualizar
-- precios y registrar el alias… y nunca lo escribe de vuelta en
-- `ordenes_items`. La fila quedaba con `producto_id = null` y
-- `estado_match = 'DESCONOCIDO'` para siempre.
--
-- Consecuencia: el stock entraba bien, pero la trazabilidad se perdía. En
-- Movimientos de Stock la fuente de remitos filtra por `producto_id not null`,
-- así que el 91% de los ingresos de Evens (2929 de 3218 líneas) eran
-- invisibles: entraba mercadería y el historial no la mostraba.
--
-- Se arreglan las dos mitades: de acá en adelante la RPC lo guarda, y el
-- historial ya cargado se reconstruye.

-- ---------------------------------------------------------------------------
-- 1. La RPC escribe el producto y la variante en la línea del remito.
--
-- `item_id` es opcional en el payload: si no viene (un caller viejo), la línea
-- se procesa igual y solo no se actualiza. El movimiento de stock nunca
-- depende de este dato.
-- ---------------------------------------------------------------------------
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
  v_cantidad integer;
  v_precio_costo numeric;
  v_precio_venta numeric;
  v_precio_base numeric;
  v_difiere_precio boolean;
  v_alias_key text;

  v_variante_id uuid;
  v_stock_id uuid;
  v_estado_actual text;

  v_productos_actualizados uuid[] := '{}';
  v_alias_registrados text[] := '{}';
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

    v_item_id      := nullif(v_item->>'item_id', '')::uuid;
    v_raw_nombre   := coalesce(v_item->>'raw_nombre', '');
    v_estado_match := v_item->>'estado_match';
    v_variante     := coalesce(nullif(v_item->>'variante', ''), 'Unico');
    v_atributos    := coalesce(v_item->'atributos', '{}'::jsonb);
    v_sku          := nullif(trim(coalesce(v_item->>'sku', '')), '');
    v_cantidad     := coalesce((v_item->>'cantidad')::integer, 0);
    v_precio_costo := nullif(v_item->>'precio_costo', '')::numeric;
    v_precio_venta := nullif(v_item->>'precio_venta_actualizado', '')::numeric;

    -- LO QUE FALTABA: a qué producto fue esta línea.
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
        atributos = v_atributos,
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
    'alias_registrados', coalesce(array_length(v_alias_registrados, 1), 0)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Backfill del historial.
--
-- Se reconstruye por `diccionario_alias`, y no es una adivinanza: ese alias lo
-- escribió la MISMA transacción que aprobó el remito, con el mismo
-- `producto_id` que se usó para mover el stock. Es la asociación real, no una
-- similitud de nombres.
--
-- Solo órdenes APROBADAS: en una pendiente, `producto_id` es justamente lo que
-- el usuario todavía está por decidir en la conciliación, y escribirlo sería
-- tomarle la decisión.
--
-- Lo que no se puede recuperar (líneas cuyo alias nunca se registró, ~1275)
-- queda en null y sigue sin aparecer. No hay dato del que sacarlo.
-- ---------------------------------------------------------------------------
update ordenes_items i
set producto_id = da.producto_id,
    variante_match = coalesce(i.variante_match, i.raw_variante)
from ordenes_compra o, diccionario_alias da
where o.id = i.orden_id
  and o.estado = 'APROBADA'
  and i.producto_id is null
  and da.negocio_id = i.negocio_id
  and da.proveedor = o.proveedor
  and da.raw_nombre = lower(trim(i.raw_nombre));
