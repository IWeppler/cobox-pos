ALTER TABLE public.actualizaciones_precio
  ADD COLUMN revertido_en timestamptz NULL;

DROP POLICY IF EXISTS "Actualizar actualizaciones" ON public.actualizaciones_precio;

CREATE POLICY "Actualizar actualizaciones solo admin"
  ON public.actualizaciones_precio
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
