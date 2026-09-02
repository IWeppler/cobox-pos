-- Borrar un producto ya no puede borrar el registro de sus unidades con IMEI:
-- `unidades_serie.producto_variante_id` pasa de ON DELETE CASCADE a RESTRICT.
--
-- POR QUÉ. `unidades_serie` es una fila por APARATO FÍSICO, y existe para
-- garantía y trazabilidad: qué equipo, con qué IMEI, salió en qué venta. Con
-- CASCADE, borrar un producto —o una variante— borraba esa historia sin dejar
-- rastro. No es historial de más: es lo que se mira cuando una clienta vuelve
-- seis meses después con el equipo fallado.
--
-- POR QUÉ AHORA VALE LA PENA Y ANTES NO SE PODÍA. Hasta 20260902110000, CADA
-- guardado de producto borraba y reinsertaba todas sus variantes, así que con
-- RESTRICT editarle el precio a un producto de electro habría sido imposible:
-- el guardado normal chocaba contra la constraint. Con el upsert, el camino de
-- edición ya NO borra variantes, y el único que sigue borrando es el borrado
-- de verdad — que es exactamente donde este freno tiene que estar.
--
-- El daño estaba sin estrenar (hoy hay 2 unidades, las dos `vendido`) porque
-- electro recién arranca. Se cierra antes de que ClickTostado cargue IMEIs en
-- serio, no después.
--
-- `reservas` SE QUEDA EN CASCADE, a propósito. Es la otra FK que borraba datos,
-- pero no es lo mismo: una reserva ya resuelta (las 3 que hay están DEVUELTA)
-- no es un registro de garantía, y su columna también es NOT NULL, así que
-- RESTRICT bloquearía el borrado del producto PARA SIEMPRE por una reserva que
-- se devolvió hace meses. El costo de esa rigidez es mayor que el dato que
-- protege.
--
-- CONSECUENCIA VISIBLE, y por eso va junto con el cambio en delete-product.ts:
-- borrar un producto con IMEIs ahora FALLA con 23503
-- (`unidades_serie_producto_variante_id_fkey`). Sin traducir ese error, la
-- pantalla dice "Ocurrió un error al eliminar los productos" y quien lo intenta
-- reintenta para siempre sin entender por qué.
--
-- Verificado en producción antes de aplicar (en transacción revertida): borrar
-- el producto con IMEIs falla con 23503; borrar un producto sin IMEIs sigue
-- funcionando; y borrar uno con reservas también, porque esa sigue en CASCADE.
--
-- REVERSIBLE: volver a CASCADE es un statement. Ver el archivo `_down`.

alter table public.unidades_serie
  drop constraint unidades_serie_producto_variante_id_fkey;

alter table public.unidades_serie
  add constraint unidades_serie_producto_variante_id_fkey
    foreign key (producto_variante_id)
    references public.producto_variantes(id)
    on delete restrict;

comment on constraint unidades_serie_producto_variante_id_fkey on public.unidades_serie is
  'RESTRICT, no CASCADE: borrar un producto o una variante no puede borrar el registro de garantía de un equipo con IMEI. Ver 20260902150000.';
