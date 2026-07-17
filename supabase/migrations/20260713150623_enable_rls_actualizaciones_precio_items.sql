
ALTER TABLE public.actualizaciones_precio_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actualizaciones_precio_items_select_propio_o_admin"
  ON public.actualizaciones_precio_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.actualizaciones_precio ap
      WHERE ap.id = actualizaciones_precio_items.lote_id
        AND (ap.creado_por = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "actualizaciones_precio_items_insert_propio"
  ON public.actualizaciones_precio_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.actualizaciones_precio ap
      WHERE ap.id = actualizaciones_precio_items.lote_id
        AND ap.creado_por = auth.uid()
    )
  );
