-- ---------------------------------------------------------------------------
-- `ajustar_stock_variantes` (plural): descuenta TODO el ticket en un viaje.
--
-- POR QUÉ. `create-sale.ts` descontaba el stock con un `for` con `await`
-- adentro: un round-trip por RENGLÓN, en fila, con la clienta esperando en el
-- mostrador. Un ticket de 6 renglones eran 6 viajes seriales antes siquiera de
-- escribir la venta. Es el mismo patrón que ya se corrigió en el paso 0 de la
-- venta (stock + variantes en dos consultas), en `aprobar_orden_compra` y en
-- `importar_productos_planilla`; acá había sobrevivido. La regla del proyecto
-- vale igual: cualquier optimización de SQL rinde menos que un viaje de red
-- ahorrado.
--
-- Y no es solo velocidad: el descuento pasa a ser ATÓMICO. Antes, si el
-- renglón 4 no tenía mercadería, los 3 primeros YA estaban descontados y había
-- que devolverlos desde Node con otros 3 viajes (`revertirStockDescontado`).
-- Ahora, o se descuenta el ticket entero o no se toca una sola fila.
--
-- TRES DETALLES QUE NO SON ADORNO:
--
-- 1. Los deltas se AGRUPAN por variante antes de escribir. `update ... from`
--    toca cada fila destino UNA sola vez por statement aunque el origen traiga
--    dos filas para ella, así que la misma variante en dos renglones del mismo
--    ticket se habría descontado una vez sola — mercadería regalada, en
--    silencio. El `group by` de `pedidos` es lo que lo evita.
--
-- 2. Se toman los row locks ANTES de chequear (`for update`, `order by id`
--    para que dos ventas simultáneas no se traben entre sí). Sin el lock, el
--    chequeo previo sería un `select` que dos requests concurrentes leen igual
--    y los dos pasan — el error que ya costó plata dos veces en este proyecto.
--
-- 3. Igual queda el chequeo de FILAS AFECTADAS después del UPDATE, que es el
--    guard real: el `where` condicional del propio UPDATE es la autoridad
--    sobre el stock, no el select de arriba. Si no coinciden, `raise` — y la
--    excepción revierte también las filas que sí se habían actualizado.
--
-- El trigger de `movimientos_stock` es FOR EACH ROW, así que un UPDATE en
-- batch sigue dejando una fila de historia por variante, con `stock_anterior`
-- y `stock_nuevo` exactos. El origen se declara una vez para toda la
-- transacción de la función, como en la versión singular.
--
-- La versión SINGULAR sigue existiendo y no se toca: la usan Carga Rápida y la
-- anulación, que ajustan de a una variante.
-- ---------------------------------------------------------------------------
create or replace function public.ajustar_stock_variantes(
  p_movimientos       jsonb,
  p_permitir_negativo boolean default false,
  p_origen            text    default null,
  p_referencia_id     uuid    default null
)
returns table (id uuid, stock numeric)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pedidos    jsonb;
  v_esperados  integer;
  v_aplicados  integer;
  v_faltantes  jsonb;
begin
  if p_origen is not null then
    perform public.marcar_origen_movimiento(p_origen, p_referencia_id);
  end if;

  -- Un delta por variante. Ver el punto 1 del encabezado.
  select coalesce(
           jsonb_agg(jsonb_build_object('variante_id', t.variante_id, 'delta', t.delta)),
           '[]'::jsonb
         )
    into v_pedidos
    from (
      select (m->>'variante_id')::uuid as variante_id,
             sum((m->>'delta')::numeric) as delta
        from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) as m
       group by 1
    ) t;

  v_esperados := jsonb_array_length(v_pedidos);
  if v_esperados = 0 then
    return;
  end if;

  -- Locks primero, y siempre en el mismo orden: dos ventas que compartan
  -- variantes se serializan en vez de pisarse, y no se trencan entre sí.
  perform 1
     from public.producto_variantes v
    where v.id in (
            select p.variante_id
              from jsonb_to_recordset(v_pedidos) as p(variante_id uuid, delta numeric)
          )
    order by v.id
      for update;

  -- Qué falta, con los ids adentro del error: Node los traduce a nombres de
  -- variante para el mensaje que ve la vendedora. Una variante inexistente —o
  -- de otro negocio, que la RLS hace invisible— cae acá igual que una sin
  -- mercadería: en las dos la venta no puede seguir.
  select coalesce(jsonb_agg(p.variante_id), '[]'::jsonb)
    into v_faltantes
    from jsonb_to_recordset(v_pedidos) as p(variante_id uuid, delta numeric)
    left join public.producto_variantes v on v.id = p.variante_id
   where v.id is null
      or (not p_permitir_negativo and v.stock + p.delta < 0);

  if jsonb_array_length(v_faltantes) > 0 then
    raise exception 'STOCK_INSUFICIENTE'
      using detail = v_faltantes::text, errcode = 'P0001';
  end if;

  return query
  update public.producto_variantes v
     set stock = v.stock + p.delta
    from jsonb_to_recordset(v_pedidos) as p(variante_id uuid, delta numeric)
   where v.id = p.variante_id
     and (p_permitir_negativo or v.stock + p.delta >= 0)
  returning v.id, v.stock;

  get diagnostics v_aplicados = row_count;

  -- El guard real. Ver el punto 3 del encabezado.
  if v_aplicados <> v_esperados then
    raise exception 'STOCK_INSUFICIENTE'
      using detail = '[]', errcode = 'P0001';
  end if;
end;
$$;

comment on function public.ajustar_stock_variantes(jsonb, boolean, text, uuid) is
  'Ajusta el stock de varias variantes en un solo viaje, todo o nada. Los deltas se agrupan por variante: la misma variante repetida en el payload se suma, no se pisa.';

revoke all on function public.ajustar_stock_variantes(jsonb, boolean, text, uuid) from public;
grant execute on function public.ajustar_stock_variantes(jsonb, boolean, text, uuid) to authenticated;
