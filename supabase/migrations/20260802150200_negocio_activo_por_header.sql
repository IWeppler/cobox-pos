-- El negocio activo viaja en el header x-negocio-activo, no en la cookie.
-- supabase-js habla con PostgREST desde otro origen: el navegador no adjunta
-- cookies y el cliente de server tampoco reenvía el Cookie header. La cookie
-- negocio_activo_id sigue siendo donde queda guardada la elección del usuario;
-- el cliente de Supabase la traduce a header en cada request.
--
-- Se sigue leyendo request.cookies como segunda opción: no cuesta nada y deja
-- funcionando cualquier llamada que sí las mande.

CREATE OR REPLACE FUNCTION security.current_negocio_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_pedido  uuid;
    v_negocio uuid;
    v_total   int;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Impersonation de super admin: no exige membresía, es soporte.
    IF security.is_super_admin() THEN
        BEGIN
            v_pedido := coalesce(
                (current_setting('request.headers', true)::json ->> 'x-impersonate-negocio')::uuid,
                (current_setting('request.cookies', true)::json ->> 'impersonate_negocio_id')::uuid
            );
            IF v_pedido IS NOT NULL THEN
                RETURN v_pedido;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    BEGIN
        v_pedido := coalesce(
            (current_setting('request.headers', true)::json ->> 'x-negocio-activo')::uuid,
            (current_setting('request.cookies', true)::json ->> 'negocio_activo_id')::uuid
        );
    EXCEPTION WHEN OTHERS THEN
        v_pedido := NULL;
    END;

    IF v_pedido IS NOT NULL THEN
        -- Sin membresía devuelve NULL: el header solo elige entre negocios
        -- propios, nunca da acceso a uno ajeno.
        SELECT un.negocio_id INTO v_negocio
        FROM public.usuarios_negocios un
        WHERE un.usuario_id = v_user_id AND un.negocio_id = v_pedido;
        RETURN v_negocio;
    END IF;

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
