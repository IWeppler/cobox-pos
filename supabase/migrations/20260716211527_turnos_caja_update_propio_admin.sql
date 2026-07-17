DROP POLICY IF EXISTS "turnos_caja_update_propio" ON public.turnos_caja;

CREATE POLICY "turnos_caja_update_propio" ON public.turnos_caja
FOR UPDATE
TO authenticated
USING (auth.uid() = vendedor_id OR public.is_admin())
WITH CHECK (auth.uid() = vendedor_id OR public.is_admin());
