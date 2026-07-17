DROP POLICY IF EXISTS "Permitir leer turnos" ON public.turnos_caja;

CREATE POLICY "turnos_caja_select_propio_o_admin" ON public.turnos_caja
  FOR SELECT TO authenticated
  USING (
    vendedor_id = auth.uid()
    OR public.is_admin()
    OR modo = 'UNICA'
  );
