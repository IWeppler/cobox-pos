ALTER TABLE public.actualizaciones_precio_items
  ADD COLUMN variante_id uuid NULL
  REFERENCES public.producto_variantes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_actualizaciones_precio_items_variante_id
  ON public.actualizaciones_precio_items(variante_id);
