-- ventas: ver-todas y anular quedan separados — tener uno no habilita el otro.
DROP POLICY IF EXISTS "ventas_update_propia_o_admin" ON public.ventas;
CREATE POLICY "ventas_update_propia_o_admin" ON public.ventas
  FOR UPDATE TO authenticated
  USING (
    (vendedor_id = auth.uid() OR tiene_permiso('ventas.ver_todas'))
    AND tiene_permiso('ventas.anular')
  )
  WITH CHECK (
    (vendedor_id = auth.uid() OR tiene_permiso('ventas.ver_todas'))
    AND tiene_permiso('ventas.anular')
  );

-- turnos_caja: is_admin() -> tiene_permiso('caja.cerrar_ajena') en las dos policies.
DROP POLICY IF EXISTS "turnos_caja_select_propio_o_admin" ON public.turnos_caja;
CREATE POLICY "turnos_caja_select_propio_o_admin" ON public.turnos_caja
  FOR SELECT TO authenticated
  USING (
    vendedor_id = auth.uid()
    OR tiene_permiso('caja.cerrar_ajena')
    OR modo = 'UNICA'
  );

DROP POLICY IF EXISTS "turnos_caja_update_propio" ON public.turnos_caja;
CREATE POLICY "turnos_caja_update_propio" ON public.turnos_caja
  FOR UPDATE TO authenticated
  USING (auth.uid() = vendedor_id OR tiene_permiso('caja.cerrar_ajena'))
  WITH CHECK (auth.uid() = vendedor_id OR tiene_permiso('caja.cerrar_ajena'));
