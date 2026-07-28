-- Sube el umbral default de 0.35 a 0.60: con datos reales de remitos
-- importados, matches por debajo de 0.5 eran mayormente coincidencias de
-- palabras genéricas ("jeans chupin", "conjunto") entre productos
-- distintos. Además ahora devuelve categoria_id y marca del candidato —
-- la capa de Node (getOrdenParaMergeAction) los usa para excluir
-- candidatos de audiencia o marca distinta a la fila importada, y para
-- mostrarlos en la card de sugerencia.
DROP FUNCTION IF EXISTS public.sugerir_productos_similares(text[], real, integer);

CREATE FUNCTION public.sugerir_productos_similares(
  p_raw_nombres text[],
  p_umbral real DEFAULT 0.60,
  p_max_por_nombre integer DEFAULT 3
)
RETURNS TABLE(
  raw_nombre text,
  producto_id uuid,
  producto_nombre text,
  categoria_id uuid,
  marca text,
  score real
)
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
      p.categoria_id,
      p.marca,
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
  SELECT raw_nombre, producto_id, producto_nombre, categoria_id, marca, score
  FROM rankeados
  WHERE rn <= p_max_por_nombre
  ORDER BY raw_nombre, score DESC;
$$;

GRANT EXECUTE ON FUNCTION public.sugerir_productos_similares(text[], real, integer) TO authenticated;
