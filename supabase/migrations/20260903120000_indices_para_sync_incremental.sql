-- Índices para la consulta de delta del catálogo.
--
-- La sincronización incremental pregunta "qué cambió desde tal momento", y esa
-- pregunta hoy es un seq scan: `updated_at` no tiene índice en ninguna de las
-- tres tablas. Con 1.226 productos y 3.363 variantes de Evens no se nota, pero
-- es exactamente el tipo de consulta que se va a correr en CADA apertura de la
-- app y sobre la tabla que más crece.
--
-- ARRANCAN POR `negocio_id`, igual que todos los índices del camino de la
-- venta (ver 20260816110000): con la RLS resuelta por statement, ese es el
-- primer filtro de toda consulta, así que un índice que empiece por la fecha
-- obligaría a leer las filas de los cuatro comercios para descartarlas
-- después.
--
-- CONCURRENTLY no se puede: `apply_migration` corre en un bloque
-- transaccional. Son tablas de miles de filas, no de millones — el lock dura
-- milisegundos. Mismo criterio que el índice de identidad de 20260902140000.
--
-- El de `catalogo_borrados` ya existe desde 20260902180000
-- (`idx_catalogo_borrados_feed`), así que no se repite.

create index if not exists idx_productos_delta
  on public.productos (negocio_id, updated_at);

create index if not exists idx_producto_variantes_delta
  on public.producto_variantes (negocio_id, updated_at);

create index if not exists idx_categorias_delta
  on public.categorias (negocio_id, updated_at);

comment on index public.idx_productos_delta is
  'Sostiene la consulta de delta del catalogo: "que cambio desde tal momento" en este negocio. Ver 20260903120000.';
