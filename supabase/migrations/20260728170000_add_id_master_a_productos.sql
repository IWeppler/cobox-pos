-- T5 — Carga Rápida consulta el Catálogo Maestro.
--
-- Referencia OPCIONAL al producto del maestro que se usó para precargar el
-- alta. Los datos (nombre, marca, modelo, atributos) se COPIAN al producto
-- local en el momento del alta: esta columna es solo trazabilidad, la venta
-- nunca depende de poder alcanzar el maestro en tiempo real.
--
-- Sin FK a propósito: catalogo_maestro vive en OTRO proyecto Supabase. Una FK
-- acá sería imposible de sostener, y además el producto local tiene que
-- sobrevivir a que la ficha del maestro se borre o se re-genere — mismo
-- criterio que producto_variantes_auditoria, que tampoco tiene FK dura.

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS id_master uuid;

COMMENT ON COLUMN public.productos.id_master IS
  'catalogo_maestro.id_master del que se precargó este producto (T5). Referencia informativa, sin FK: el maestro vive en otro proyecto.';

-- Para responder "¿este producto ya lo di de alta desde el maestro?" sin
-- escanear la tabla. Parcial: la enorme mayoría de los productos de un
-- comercio de indumentaria nunca va a tener id_master.
CREATE INDEX IF NOT EXISTS idx_productos_id_master
  ON public.productos (id_master)
  WHERE id_master IS NOT NULL;
