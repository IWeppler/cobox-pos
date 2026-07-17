-- Ajusta producto_variantes.stock de forma atómica a nivel de fila.
-- p_delta negativo = descuento (venta, baja) — la condición
-- `stock + p_delta >= 0` es el equivalente de "stock >= cantidad" cuando
-- p_delta = -cantidad, y rechaza la fila (0 rows) si no alcanza.
-- p_delta positivo = incremento (restaurar/rollback) — la condición
-- siempre se cumple.
CREATE OR REPLACE FUNCTION public.ajustar_stock_variante(
  p_variante_id uuid,
  p_delta integer
)
RETURNS TABLE(id uuid, stock integer)
LANGUAGE sql
AS $$
  UPDATE public.producto_variantes
  SET stock = stock + p_delta
  WHERE producto_variantes.id = p_variante_id
    AND producto_variantes.stock + p_delta >= 0
  RETURNING producto_variantes.id, producto_variantes.stock;
$$;

REVOKE ALL ON FUNCTION public.ajustar_stock_variante(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ajustar_stock_variante(uuid, integer) TO authenticated;
