ALTER TABLE public.configuracion_pos
  ADD COLUMN IF NOT EXISTS permitir_venta_sin_stock boolean DEFAULT false NOT NULL;

-- Reemplaza ajustar_stock_variante para soportar dejar el stock en negativo
-- cuando configuracion_pos.permitir_venta_sin_stock = true. p_permitir_negativo
-- default false preserva el comportamiento actual para cualquier caller que no
-- lo pase explícitamente (ej. app/(dashboard)/stock/bajas, que siempre debe
-- seguir bloqueando negativos).
DROP FUNCTION IF EXISTS public.ajustar_stock_variante(uuid, integer);

CREATE FUNCTION public.ajustar_stock_variante(
  p_variante_id uuid,
  p_delta integer,
  p_permitir_negativo boolean DEFAULT false
)
 RETURNS TABLE(id uuid, stock integer)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  UPDATE public.producto_variantes
  SET stock = stock + p_delta
  WHERE producto_variantes.id = p_variante_id
    AND (p_permitir_negativo OR producto_variantes.stock + p_delta >= 0)
  RETURNING producto_variantes.id, producto_variantes.stock;
$function$;
