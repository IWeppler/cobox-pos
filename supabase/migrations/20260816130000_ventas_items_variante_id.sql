-- `ventas_items` guarda a qué VARIANTE corresponde cada renglón.
--
-- Hasta acá solo guardaba el texto (`variante`: "Talle M / Blanco"), así que
-- anular una venta tenía que buscar la variante por `nombre_display` para
-- devolverle el stock. Eso choca de frente con la regla del proyecto —el stock
-- se mueve por `variante_id`, nunca por nombre— y no era negligencia del código
-- de anulación: la columna no existía, no había con qué.
--
-- No es teórico. De los 1.032 renglones vendidos, 117 (11%) ya NO encuentran
-- su variante por nombre: se renombró el talle, se editó el producto, se
-- rehizo la carga. Anular cualquiera de esas ventas hoy devuelve el stock a
-- ningún lado, sin error y sin aviso.
--
-- Sin FK, por el mismo criterio que `producto_variantes_auditoria` y
-- `unidades_serie.venta_id`: lo que ya se vendió tiene que sobrevivir a que la
-- variante desaparezca del catálogo. La FK convertiría el borrado de un
-- producto viejo en un borrado (o un bloqueo) del historial de ventas.
--
-- Nullable porque los 117 sin match se quedan en NULL, y porque un producto
-- legacy sin fila en producto_variantes nunca va a tener uno. La anulación
-- tiene que seguir funcionando para esos: cae al camino por nombre, que es
-- exactamente lo que hace hoy para todos.

alter table public.ventas_items
  add column if not exists variante_id uuid;

comment on column public.ventas_items.variante_id is
  'Variante vendida. Es por acá que la anulación devuelve el stock (RPC '
  'ajustar_stock_variante), no por el texto de `variante`. Sin FK a propósito: '
  'el historial de ventas sobrevive a que la variante se borre del catálogo. '
  'NULL en los renglones viejos que ya no matchean por nombre y en los '
  'productos legacy sin producto_variantes.';

-- Backfill por nombre: es la misma resolución que venía haciendo la anulación
-- en caliente, hecha una sola vez y congelada. Los que hoy matchean quedan
-- atados para siempre, aunque mañana se renombre el talle.
update public.ventas_items vi
   set variante_id = v.id
  from public.producto_variantes v
 where vi.variante_id is null
   and v.producto_id = vi.producto_id
   and v.nombre_display = vi.variante;

create index if not exists ventas_items_variante_idx
  on public.ventas_items (variante_id)
  where variante_id is not null;
