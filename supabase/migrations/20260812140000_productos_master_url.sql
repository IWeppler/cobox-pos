-- `productos.master_url`: la copia de mayor calidad de cada foto, para poder
-- volver atrás.
--
-- El problema que resuelve: hoy `optimizarImagenProducto` genera TRES derivadas
-- (main 1100px, grid 480px, thumb 150px) todas con `initialQuality: 0.7`, y
-- sube esas tres. El archivo que eligió la dueña no llega nunca a Storage. La
-- copia de mayor calidad que existe en el sistema es `main`, que ya es lossy.
--
-- Consecuencia real, ya vivida: una vez se comprimió de más, la dueña de Evens
-- se quejó de la calidad, y no se pudo revertir — no había desde dónde
-- regenerar. Ese es el costo de no guardar un master: cualquier decisión de
-- compresión es irreversible, así que en los hechos NO se puede optimizar
-- imágenes nunca más sin arriesgar lo mismo.
--
-- El master es 1600px al 0.9: alcanza para regenerar cualquier derivada (la más
-- grande es main, 1100px) sin guardar los originales de 8MB que salen de un
-- celular. No se muestra nunca en la UI; existe solo como fuente.
--
-- Formato: JSON array de URLs, mismo shape que `imagen_url` / `thumbnail_url` /
-- `grid_url`, y alineado por índice con ellas. Puede tener `null` en una
-- posición: si falla la subida del master, el trío visible se guarda igual —
-- una foto sin master es peor que no tener la foto, pero mucho menos peor que
-- perder el alta del producto por una red de seguridad.
--
-- NULL en las 1.727 filas existentes es lo correcto y es información: son
-- justo las fotos que NO se pueden regenerar. Sirve para saber cuáles se
-- pueden reoptimizar sin riesgo (las que tengan master) y cuáles no.

alter table public.productos
  add column if not exists master_url text;

comment on column public.productos.master_url is
  'JSON array de URLs de la copia de mayor calidad (1600px @0.9), alineado por índice con imagen_url. Fuente para regenerar derivadas; nunca se muestra en la UI. NULL = foto anterior a esta migración, no regenerable.';

-- Los GRANT de esta tabla son POR COLUMNA (los dejó así
-- 20260811140000_rls_anon_catalogo_publico), así que una columna nueva nace sin
-- permiso para NADIE: sin esto, el alta de productos falla al escribirla.
grant select, insert, update (master_url) on public.productos to authenticated;

-- A `anon` NO se le da, a propósito. El master es la imagen más pesada del
-- sistema y no se muestra en el catálogo: exponerla sería servir 600 KB donde
-- se ven 11, a cualquiera con la anon key (que es pública). El catálogo sigue
-- leyendo grid_url/thumbnail_url.
