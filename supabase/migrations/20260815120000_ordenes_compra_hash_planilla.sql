-- Subir dos veces la misma planilla no puede duplicar el stock.
--
-- El importador anterior tenía este guard (`importaciones_productos`, unique
-- parcial por hash) y el flujo unificado lo había perdido: la conciliación
-- protege contra aprobar DOS VECES la misma orden, pero no contra crear dos
-- órdenes distintas desde el mismo archivo. Aprobar las dos duplica todo.
--
-- Es exactamente la clase de error que ya costó plata acá (el incidente de
-- Estilo Bonito: 8 reintentos = stock ×8), así que el guard va en la base y no
-- en el código.
--
-- El hash es del CONTENIDO parseado, no de los bytes: la misma planilla en CSV
-- y en XLSX es el mismo import, y cambiar una cantidad la vuelve otra distinta
-- —que es justo cuando sí se quiere poder volver a subirla.

alter table public.ordenes_compra
  add column if not exists hash_planilla text;

comment on column public.ordenes_compra.hash_planilla is
  'Huella del contenido de la planilla propia que originó esta orden (sha256 de las filas parseadas, ver hash-import-productos.ts). Null en los remitos de proveedor, que se cargan a mano y no tienen archivo canónico.';

-- Unique PARCIAL: solo aplica a las órdenes que vinieron de una planilla. Los
-- remitos de proveedor tienen hash null y no compiten entre sí — en Postgres
-- varios null no violan un unique, pero el índice parcial además los deja
-- afuera del índice.
create unique index if not exists uq_ordenes_compra_hash_planilla
  on public.ordenes_compra (negocio_id, hash_planilla)
  where hash_planilla is not null;
