CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- unaccent() de la extension es STABLE (depende del diccionario resuelto en
-- runtime), no se puede usar directo en una expresión de índice. Este
-- wrapper fija el diccionario explícito (evita depender de search_path,
-- que además viaja SET a '' en las funciones de abajo) y es seguro
-- declararlo IMMUTABLE porque el diccionario 'unaccent' es fijo y
-- determinístico para el mismo input.
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm
  ON public.productos
  USING gin (public.unaccent_immutable(lower(nombre)) extensions.gin_trgm_ops)
  WHERE publicado = true;

CREATE FUNCTION public.sugerir_productos_similares(
  p_raw_nombres text[],
  p_umbral real DEFAULT 0.35,
  p_max_por_nombre integer DEFAULT 3
)
RETURNS TABLE(raw_nombre text, producto_id uuid, producto_nombre text, score real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH entrada AS (
    SELECT DISTINCT unnest(p_raw_nombres) AS raw_nombre
  ),
  candidatos AS (
    SELECT
      e.raw_nombre,
      p.id AS producto_id,
      p.nombre AS producto_nombre,
      extensions.similarity(
        public.unaccent_immutable(lower(p.nombre)),
        public.unaccent_immutable(lower(e.raw_nombre))
      ) AS score
    FROM entrada e
    JOIN public.productos p
      ON p.publicado = true
     AND public.unaccent_immutable(lower(p.nombre))
         OPERATOR(extensions.%) public.unaccent_immutable(lower(e.raw_nombre))
  ),
  rankeados AS (
    SELECT
      *,
      row_number() OVER (
        PARTITION BY raw_nombre ORDER BY score DESC
      ) AS rn
    FROM candidatos
    WHERE score >= p_umbral
  )
  SELECT raw_nombre, producto_id, producto_nombre, score
  FROM rankeados
  WHERE rn <= p_max_por_nombre
  ORDER BY raw_nombre, score DESC;
$$;

GRANT EXECUTE ON FUNCTION public.sugerir_productos_similares(text[], real, integer) TO authenticated;
