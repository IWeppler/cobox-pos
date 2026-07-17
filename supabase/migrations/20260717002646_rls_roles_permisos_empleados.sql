-- ============================================================
-- Fase 4 — RLS para la pantalla de Empleados y Permisos
-- ============================================================

-- roles y permisos: catálogos de solo lectura desde la UI en esta
-- primera versión. Agregar un rol o un permiso nuevo sigue siendo
-- tarea de código/migración, no de la pantalla.
CREATE POLICY "roles_select_admin" ON public.roles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "permisos_select_admin" ON public.permisos
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- rol_permisos: la matriz sí se edita desde la UI. Gateada con
-- is_admin() directo (no vía tiene_permiso('configuracion.empleados_y_permisos'))
-- para evitar que un permiso controle el acceso a la tabla que define
-- los permisos.
CREATE POLICY "rol_permisos_select_admin" ON public.rol_permisos
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "rol_permisos_insert_admin" ON public.rol_permisos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "rol_permisos_update_admin" ON public.rol_permisos
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "rol_permisos_delete_admin" ON public.rol_permisos
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- perfiles: hoy solo tiene policy de SELECT (qual=true), ninguna de
-- UPDATE. Sin esto, actualizarRolEmpleadoAction actualizaría 0 filas
-- en silencio (RLS bloquea el UPDATE sin error visible). Necesaria
-- para poder reasignar rol_id (y sincronizar el texto legacy) desde
-- esta pantalla.
CREATE POLICY "perfiles_update_admin" ON public.perfiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
