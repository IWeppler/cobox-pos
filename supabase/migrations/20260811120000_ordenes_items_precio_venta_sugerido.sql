-- Precio de VENTA que viene en la planilla del proveedor.
--
-- Hasta acá el remito solo traía `precio_costo`: el precio de venta se
-- decidía entero en la conciliación (recargo global, edición fila por fila
-- o costo + 50% al crear al vuelo). Cuando el proveedor ya manda el precio
-- sugerido al público, esa columna se perdía — peor: al no ser una columna
-- conocida, entraba como ATRIBUTO de la variante ("PRECIO VENTA: 14900").
--
-- Es SUGERIDO, no el precio final: lo que se escribe en `productos.precio`
-- sigue siendo `precio_venta_actualizado`, que es lo que el usuario aprueba
-- en la pantalla de conciliación. Esta columna solo siembra ese valor.
--
-- Aditiva y nullable a propósito: los remitos ya cargados quedan en NULL y
-- la conciliación se comporta igual que antes para ellos.
alter table public.ordenes_items
  add column if not exists precio_venta_sugerido numeric;

comment on column public.ordenes_items.precio_venta_sugerido is
  'Precio de venta al público sugerido en la planilla del proveedor. Siembra precio_venta_actualizado en la conciliación; NO es el precio final.';
