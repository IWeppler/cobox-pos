CREATE FUNCTION public.sugerencias_valores_atributo(p_nombre text)
RETURNS TABLE(valor text, productos bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT atributos->>p_nombre AS valor, count(DISTINCT producto_id) AS productos
  FROM public.producto_variantes
  WHERE atributos ? p_nombre AND atributos->>p_nombre <> ''
  GROUP BY atributos->>p_nombre
  ORDER BY productos DESC;
$$;

GRANT EXECUTE ON FUNCTION public.sugerencias_valores_atributo(text) TO authenticated;
