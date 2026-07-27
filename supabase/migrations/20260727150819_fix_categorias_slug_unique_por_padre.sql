-- Evens prod bloqueaba a Evelyn creando subcategorías: categorias_slug_key
-- era UNIQUE(slug) global, pero el modelo de árbol necesita que un mismo
-- nombre de subcategoría pueda repetirse bajo padres distintos (ej.
-- "Remeras" en dos categorías principales distintas). Aplicado ya en vivo
-- como hotfix de emergencia (2026-07-27, vía SQL editor) — esta migración
-- solo lo deja versionado en el repo.

ALTER TABLE public.categorias
  DROP CONSTRAINT IF EXISTS categorias_slug_key;

-- Único entre categorías PADRE (parent_id IS NULL) — dos padres no pueden
-- compartir slug.
CREATE UNIQUE INDEX IF NOT EXISTS categorias_slug_root_key
  ON public.categorias (slug)
  WHERE parent_id IS NULL;

-- Único DENTRO de cada padre — dos subcategorías del MISMO padre no
-- pueden compartir slug, pero el mismo slug puede repetirse bajo padres
-- distintos.
CREATE UNIQUE INDEX IF NOT EXISTS categorias_slug_child_key
  ON public.categorias (parent_id, slug)
  WHERE parent_id IS NOT NULL;
