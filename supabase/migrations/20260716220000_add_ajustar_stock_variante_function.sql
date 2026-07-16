CREATE OR REPLACE FUNCTION public.ajustar_stock_variante(p_variante_id uuid, p_delta integer)
 RETURNS TABLE(id uuid, stock integer)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  UPDATE public.producto_variantes
  SET stock = stock + p_delta
  WHERE producto_variantes.id = p_variante_id
    AND producto_variantes.stock + p_delta >= 0
  RETURNING producto_variantes.id, producto_variantes.stock;
$function$;
