-- Rellena los `ventas_items.variante_id` de la ventana entre el backfill
-- original (20260816130000) y el deploy que empezó a mandar la columna desde
-- create-sale.ts.
--
-- La columna se agregó y se backfilleó el 16/8, pero el POS siguió insertando
-- sin ella hasta el deploy del 17/8 a la tarde: las ventas de ese hueco
-- nacieron con `variante_id` en null. Son 8 renglones de 3 ventas de Estilo
-- Bonito, y los 8 resuelven por `nombre_display`.
--
-- Mismo criterio que el backfill original: match exacto por producto +
-- nombre_display, y lo que no matchea se queda en null (el fallback por nombre
-- de la anulación lo sigue cubriendo). Idempotente: solo toca filas en null.
update public.ventas_items i
   set variante_id = pv.id
  from public.producto_variantes pv
 where i.variante_id is null
   and pv.producto_id = i.producto_id
   and pv.nombre_display = i.variante;
