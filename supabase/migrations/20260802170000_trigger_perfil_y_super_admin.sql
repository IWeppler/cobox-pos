-- 1. El trigger que crea el perfil NUNCA existió en esta base.
-- handle_new_user() estaba definida pero sin disparador, así que todo usuario
-- creado por invitación quedaba en auth.users sin fila en perfiles, y
-- aceptar_invitacion() —que busca el email en perfiles— lo rechazaba.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill de los que quedaron sin perfil por la falta del trigger.
INSERT INTO public.perfiles (id, email, nombre)
SELECT u.id, u.email,
       coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.perfiles p ON p.id = u.id
WHERE p.id IS NULL AND u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2. aceptar_invitacion deja de depender de que el perfil exista: el email de
-- verdad es el de auth.users. Y si el perfil falta, lo crea en el momento.
CREATE OR REPLACE FUNCTION public.aceptar_invitacion(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user  uuid := auth.uid();
    v_email text;
    v_inv   public.invitaciones;
    v_rol   text;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesión para aceptar una invitación';
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_user;
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'La cuenta no tiene email verificable';
    END IF;

    INSERT INTO public.perfiles (id, email, nombre)
    VALUES (v_user, v_email, split_part(v_email, '@', 1))
    ON CONFLICT (id) DO NOTHING;

    -- El UPDATE condicional es el que decide: si dos clicks llegan juntos, uno
    -- solo encuentra la fila en PENDIENTE y el otro no toca nada.
    UPDATE public.invitaciones
    SET estado = 'ACEPTADA'
    WHERE token = p_token
      AND estado = 'PENDIENTE'
      AND expira_en > now()
      AND lower(email) = lower(v_email)
    RETURNING * INTO v_inv;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitación inválida, vencida o de otro email';
    END IF;

    SELECT CASE WHEN r.nombre = 'ENCARGADO' THEN 'VENDEDOR' ELSE r.nombre END
    INTO v_rol
    FROM public.roles r WHERE r.id = v_inv.rol_id;

    INSERT INTO public.usuarios_negocios (usuario_id, negocio_id, rol_id, rol)
    VALUES (v_user, v_inv.negocio_id, v_inv.rol_id, v_rol)
    ON CONFLICT (usuario_id, negocio_id) DO NOTHING;

    RETURN v_inv.negocio_id;
END;
$function$;

-- 3. is_super_admin vivía solo en el schema security, que PostgREST no expone:
-- supabase.rpc("is_super_admin") fallaba y el layout de /admincomerz mandaba al
-- POS a su propio super admin.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT security.is_super_admin();
$function$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
