CREATE POLICY "Lectura pública de producto_variantes"
  ON public.producto_variantes
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Lectura pública de producto_variante_valores"
  ON public.producto_variante_valores
  FOR SELECT
  TO public
  USING (true);
