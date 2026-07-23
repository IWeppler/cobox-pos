-- Tercera pasada de la auditoría prod vs este proyecto: promociones_productos
-- tiene RLS habilitado sin ninguna policy en este proyecto (fail-closed:
-- tabla totalmente inaccesible, ni lectura pública ni escritura del staff).

CREATE POLICY "Lectura pública de promociones_productos"
  ON public.promociones_productos FOR SELECT TO public
  USING (true);

CREATE POLICY "Select promociones_productos"
  ON public.promociones_productos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Insert promociones_productos"
  ON public.promociones_productos FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Delete promociones_productos"
  ON public.promociones_productos FOR DELETE TO authenticated
  USING (true);
