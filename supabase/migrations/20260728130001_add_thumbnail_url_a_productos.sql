-- Drift encontrado en la misma pasada que el RLS: `productos.thumbnail_url`
-- existe en Evens prod (migración 20260721123543, aplicada allá y nunca
-- bajada a un archivo) pero ningún archivo del repo la crea.
--
-- La columna la usa código en producción: entities/productos/types.ts,
-- features/stock/ui/stock-grid.tsx, features/store/components/product-detail.tsx,
-- features/store/components/related-products.tsx y
-- scripts/backfill-image-thumbnails.ts. Un proyecto levantado solo desde
-- el repo rompe el catálogo y la grilla de stock sin esto.

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS thumbnail_url text;
