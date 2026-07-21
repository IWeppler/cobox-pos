-- Bootstrap histórico: esta función existía en prod desde el esquema inicial
-- (creada a mano, nunca quedó capturada en una migración) y la usan varias
-- políticas RLS antes de que 20260717001048_roles_y_permisos_schema.sql la
-- reemplace (CREATE OR REPLACE) por la versión basada en roles/rol_id.
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'ADMIN'
  );
$function$;
