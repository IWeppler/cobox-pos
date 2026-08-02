-- Modo Dios del super admin de Comerz.
--
-- Tres cosas que faltaban:
-- 1. El super admin no pertenece a ningún negocio, así que la policy de
--    `negocios` (id = current_negocio_id()) le devolvía CERO filas: la pantalla
--    /admincomerz/negocios se veía vacía y no había a quién impersonar.
-- 2. Impersonando, is_admin() seguía siendo false —no tiene membresía en ese
--    negocio— así que entraba a los datos pero con UI de vendedor.
-- 3. rol_actual() devolvía NULL, que el middleware lee como "sin negocio".

DROP POLICY IF EXISTS negocios_select_super_admin ON public.negocios;
CREATE POLICY negocios_select_super_admin ON public.negocios
    FOR SELECT TO authenticated
    USING (security.is_super_admin());

-- El super admin es admin en cualquier negocio que esté impersonando. Es
-- exactamente lo que significa el modo dios; el acceso a los datos ya lo tenía
-- vía security.current_negocio_id().
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT security.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.usuarios_negocios un
    JOIN public.roles r ON r.id = un.rol_id
    WHERE un.usuario_id = auth.uid()
      AND un.negocio_id = security.current_negocio_id()
      AND r.nombre = 'ADMIN'
  );
$function$;

-- rol_actual() lo usa el middleware como señal de "hay negocio resuelto".
-- Impersonando hay uno, y el rol es ADMIN.
CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN security.is_super_admin() AND security.current_negocio_id() IS NOT NULL
      THEN 'ADMIN'
    ELSE (
      SELECT un.rol
      FROM public.usuarios_negocios un
      WHERE un.usuario_id = auth.uid()
        AND un.negocio_id = security.current_negocio_id()
    )
  END;
$function$;
