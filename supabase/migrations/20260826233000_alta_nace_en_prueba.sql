-- Un comercio que se da de alta solo nace en 'prueba', no en 'activo'.
--
-- `crear_negocio_con_owner` insertaba `estado = 'activo'` con el plan Prueba y
-- 14 días de vencimiento. O sea que toda alta self-service entraba al panel de
-- Comerz como CLIENTE QUE PAGA: sumaba al MRR teórico y al contador de
-- "Activos", y no aparecía nunca en "En prueba" — aunque no hubiera pagado un
-- peso.
--
-- Es exactamente lo que el estado `prueba` viene a evitar, y está escrito en
-- CLAUDE.md: lo que separa `activo` de `prueba` NO es el acceso sino el cobro
-- ("prueba" = todavía no pagó nunca; cuando entra el primer pago pasa a
-- activo). La versión vieja de esta misma función ya lo hacía bien y hasta lo
-- explicaba en un comentario; la que quedó viva se le desincronizó.
--
-- No cambia NADA del acceso: `prueba` está en ESTADOS_HABILITADOS, así que el
-- dueño entra igual, su catálogo público abre igual y el trial sigue
-- desbloqueando todo. Lo único que cambia es cómo lo cuenta el panel — que era
-- el punto.
--
-- Sin backfill a propósito: los negocios vivos ya tienen su estado puesto a
-- mano y decidido por Comerz, y reescribirlo desde una migración sería tomar
-- una decisión comercial sobre clientes reales.

CREATE OR REPLACE FUNCTION public.crear_negocio_con_owner(
    p_nombre text,
    p_slug text,
    p_whatsapp text,
    p_rubro_comercial text DEFAULT NULL::text,
    p_tamano_equipo text DEFAULT NULL::text,
    p_rubro text DEFAULT 'indumentaria'::text,
    p_razon_social text DEFAULT NULL::text,
    p_cuit text DEFAULT NULL::text,
    p_condicion_iva text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user      uuid := auth.uid();
    v_negocio   uuid;
    v_rol_admin uuid;
    v_plan      uuid;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesión para crear un negocio';
    END IF;

    SELECT id INTO v_plan FROM public.planes WHERE nombre = 'Prueba';
    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'No existe el plan de prueba';
    END IF;

    -- 'prueba' y no 'activo': entra igual a todo, pero el panel lo cuenta como
    -- lo que es hasta que pague.
    INSERT INTO public.negocios (
      nombre, slug, estado, plan_id, plan_vencimiento, rubro_comercial, tamano_equipo
    )
    VALUES (
      p_nombre, p_slug, 'prueba', v_plan, now() + interval '14 days',
      p_rubro_comercial, p_tamano_equipo
    )
    RETURNING id INTO v_negocio;

    INSERT INTO public.roles (nombre, negocio_id, es_sistema)
    VALUES ('ADMIN', v_negocio, true), ('ENCARGADO', v_negocio, true), ('VENDEDOR', v_negocio, true);

    SELECT id INTO v_rol_admin FROM public.roles
    WHERE negocio_id = v_negocio AND nombre = 'ADMIN';

    INSERT INTO public.rol_permisos (rol_id, permiso_id, negocio_id)
    SELECT v_rol_admin, p.id, v_negocio FROM public.permisos p;

    INSERT INTO public.configuracion_pos (
      negocio_id, "posName", whatsapp, rubro, razon_social, cuit, condicion_iva
    )
    VALUES (
      v_negocio, p_nombre, p_whatsapp,
      CASE WHEN p_rubro = 'electro' THEN 'electro' ELSE 'indumentaria' END,
      nullif(btrim(coalesce(p_razon_social, '')), ''),
      nullif(btrim(coalesce(p_cuit, '')), ''),
      nullif(btrim(coalesce(p_condicion_iva, '')), '')
    );

    -- Los tres de arranque (20260826230000). `negocio_id` va EXPLÍCITO y no por
    -- el default de la columna, que en el alta apunta a otro negocio.
    INSERT INTO public.metodos_pago (negocio_id, nombre, tipo, comision, acreditacion_dias, activo)
    VALUES
      (v_negocio, 'Efectivo',      'EFECTIVO',          0, 0, true),
      (v_negocio, 'Transferencia', 'TRANSFERENCIA',     0, 0, true),
      (v_negocio, 'Mercado Pago',  'BILLETERA_VIRTUAL', 0, 0, true);

    INSERT INTO public.usuarios_negocios (usuario_id, negocio_id, rol_id, rol, es_owner)
    VALUES (v_user, v_negocio, v_rol_admin, 'ADMIN', true);

    RETURN v_negocio;
END;
$function$;
