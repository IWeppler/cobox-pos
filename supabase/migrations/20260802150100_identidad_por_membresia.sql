-- Identidad SaaS, parte 2: las funciones de seguridad dejan de leer
-- perfiles.negocio_id / perfiles.rol_id y pasan a usuarios_negocios.
-- El negocio activo del request sale de la cookie negocio_activo_id, SIEMPRE
-- validada contra una membresía real: una cookie inventada resuelve NULL.
--
-- perfiles.negocio_id, perfiles.rol_id y perfiles.rol quedan como columnas
-- deprecadas (nullable) en vez de borrarse: si se van en esta migración, el
-- código todavía desplegado que las lee rompe entre el apply y el deploy.
-- Se borran en una migración posterior, con el deploy ya verde.

-- ---------------------------------------------------------------------------
-- Negocio activo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security.current_negocio_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id  uuid;
    v_cookie   uuid;
    v_negocio  uuid;
    v_total    int;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF security.is_super_admin() THEN
        BEGIN
            v_cookie := (current_setting('request.cookies', true)::json ->> 'impersonate_negocio_id')::uuid;
            IF v_cookie IS NOT NULL THEN
                RETURN v_cookie;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    BEGIN
        v_cookie := (current_setting('request.cookies', true)::json ->> 'negocio_activo_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_cookie := NULL;
    END;

    IF v_cookie IS NOT NULL THEN
        -- Sin membresía devuelve NULL: la cookie sola no da acceso a nada.
        SELECT un.negocio_id INTO v_negocio
        FROM public.usuarios_negocios un
        WHERE un.usuario_id = v_user_id AND un.negocio_id = v_cookie;
        RETURN v_negocio;
    END IF;

    -- Sin cookie: si pertenece a un solo negocio no hace falta elegir.
    SELECT count(*) INTO v_total
    FROM public.usuarios_negocios WHERE usuario_id = v_user_id;

    IF v_total <> 1 THEN
        RETURN NULL;
    END IF;

    SELECT negocio_id INTO v_negocio
    FROM public.usuarios_negocios WHERE usuario_id = v_user_id;
    RETURN v_negocio;
END;
$function$;

-- ¿Ese usuario comparte el negocio activo conmigo? Hace falta SECURITY DEFINER
-- porque las policies de usuarios_negocios solo dejan ver las membresías
-- propias, y las pantallas de caja y ventas listan compañeros de trabajo.
CREATE OR REPLACE FUNCTION security.comparte_negocio(p_usuario uuid)
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios_negocios un
    WHERE un.usuario_id = p_usuario
      AND un.negocio_id = security.current_negocio_id()
  );
$function$;

-- ---------------------------------------------------------------------------
-- RBAC por negocio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_negocios un
    JOIN public.roles r ON r.id = un.rol_id
    WHERE un.usuario_id = auth.uid()
      AND un.negocio_id = security.current_negocio_id()
      AND r.nombre = 'ADMIN'
  );
$function$;

CREATE OR REPLACE FUNCTION security.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_admin();
$function$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(clave text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_negocios un
      JOIN public.rol_permisos rp ON rp.rol_id = un.rol_id
      JOIN public.permisos perm ON perm.id = rp.permiso_id
      WHERE un.usuario_id = auth.uid()
        AND un.negocio_id = security.current_negocio_id()
        AND perm.clave = tiene_permiso.clave
    );
$function$;

-- Rol de texto del negocio activo. Reemplaza a los `select rol from perfiles`
-- que quedaron sin sentido cuando un usuario puede tener dos roles distintos
-- en dos negocios.
CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT un.rol
  FROM public.usuarios_negocios un
  WHERE un.usuario_id = auth.uid()
    AND un.negocio_id = security.current_negocio_id();
$function$;

GRANT EXECUTE ON FUNCTION security.comparte_negocio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated;

-- ---------------------------------------------------------------------------
-- perfiles: usuario global
-- ---------------------------------------------------------------------------
ALTER TABLE public.perfiles ALTER COLUMN negocio_id DROP NOT NULL;
ALTER TABLE public.perfiles ALTER COLUMN rol_id     DROP NOT NULL;
ALTER TABLE public.perfiles ALTER COLUMN rol        DROP NOT NULL;
ALTER TABLE public.perfiles ALTER COLUMN rol_id     DROP DEFAULT;
ALTER TABLE public.perfiles ALTER COLUMN negocio_id DROP DEFAULT;

COMMENT ON COLUMN public.perfiles.negocio_id IS 'DEPRECADO: la pertenencia vive en usuarios_negocios. Se borra tras el deploy.';
COMMENT ON COLUMN public.perfiles.rol_id     IS 'DEPRECADO: el rol es por negocio, en usuarios_negocios.rol_id.';
COMMENT ON COLUMN public.perfiles.rol        IS 'DEPRECADO: usar rol_actual() o usuarios_negocios.rol.';

-- El alta de usuario crea SOLO el perfil global. La pertenencia a un negocio
-- llega después: creando un negocio (owner) o aceptando una invitación.
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
  );
  RETURN new;
END;
$function$;

-- El aislamiento de perfiles pasa a ser por membresía compartida.
DROP POLICY IF EXISTS aislamiento_negocio ON public.perfiles;
CREATE POLICY aislamiento_negocio ON public.perfiles
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (id = auth.uid() OR security.comparte_negocio(id))
    WITH CHECK (id = auth.uid() OR security.comparte_negocio(id));

-- ---------------------------------------------------------------------------
-- Invitaciones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitaciones (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id   uuid NOT NULL REFERENCES public.negocios(id) ON DELETE CASCADE,
    email        text NOT NULL,
    rol_id       uuid NOT NULL,
    token        uuid NOT NULL DEFAULT gen_random_uuid(),
    invitado_por uuid REFERENCES public.perfiles(id),
    estado       text NOT NULL DEFAULT 'PENDIENTE'
                 CHECK (estado IN ('PENDIENTE','ACEPTADA','CANCELADA')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    expira_en    timestamptz NOT NULL DEFAULT now() + interval '7 days',
    CONSTRAINT invitaciones_token_key UNIQUE (token),
    CONSTRAINT invitaciones_rol_fkey
        FOREIGN KEY (rol_id, negocio_id) REFERENCES public.roles(id, negocio_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS invitaciones_pendiente_unica
    ON public.invitaciones (negocio_id, lower(email)) WHERE estado = 'PENDIENTE';
CREATE INDEX IF NOT EXISTS idx_invitaciones_negocio ON public.invitaciones (negocio_id);

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

-- El invitado NO lee esta tabla: acepta por RPC con el token. Así el token no
-- se puede enumerar desde el cliente.
DROP POLICY IF EXISTS invitaciones_admin_del_negocio ON public.invitaciones;
CREATE POLICY invitaciones_admin_del_negocio ON public.invitaciones
    FOR ALL TO authenticated
    USING (negocio_id = security.current_negocio_id() AND public.is_admin())
    WITH CHECK (negocio_id = security.current_negocio_id() AND public.is_admin());

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

    SELECT email INTO v_email FROM public.perfiles WHERE id = v_user;

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

GRANT EXECUTE ON FUNCTION public.aceptar_invitacion(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Alta de negocio: el que lo crea queda como owner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_negocio_con_owner(
    p_nombre   text,
    p_slug     text,
    p_whatsapp text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user     uuid := auth.uid();
    v_negocio  uuid;
    v_rol_admin uuid;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesión para crear un negocio';
    END IF;

    INSERT INTO public.negocios (nombre, slug, estado)
    VALUES (p_nombre, p_slug, 'activo')
    RETURNING id INTO v_negocio;

    INSERT INTO public.roles (nombre, negocio_id, es_sistema)
    VALUES ('ADMIN', v_negocio, true),
           ('ENCARGADO', v_negocio, true),
           ('VENDEDOR', v_negocio, true);

    SELECT id INTO v_rol_admin FROM public.roles
    WHERE negocio_id = v_negocio AND nombre = 'ADMIN';

    -- ADMIN arranca con todo; ENCARGADO y VENDEDOR se arman desde la pantalla
    -- de permisos, que ya existe.
    INSERT INTO public.rol_permisos (rol_id, permiso_id, negocio_id)
    SELECT v_rol_admin, p.id, v_negocio FROM public.permisos p;

    INSERT INTO public.configuracion_pos (negocio_id, "posName", whatsapp)
    VALUES (v_negocio, p_nombre, p_whatsapp);

    INSERT INTO public.metodos_pago (negocio_id, nombre, tipo)
    VALUES (v_negocio, 'Efectivo', 'EFECTIVO');

    INSERT INTO public.usuarios_negocios (usuario_id, negocio_id, rol_id, rol, es_owner)
    VALUES (v_user, v_negocio, v_rol_admin, 'ADMIN', true);

    RETURN v_negocio;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_negocio_con_owner(text, text, text) TO authenticated;
