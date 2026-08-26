-- El alta de un comercio siembra los TRES métodos de pago de arranque, no uno.
--
-- Hasta acá `crear_negocio_con_owner` insertaba solo Efectivo, así que el
-- default real era "efectivo y nada más": cada comercio nuevo tenía que cargar
-- transferencia y billetera antes de poder cobrar como cobra de verdad.
--
-- Por qué las tres filas van escritas acá y no llamando a
-- `seed_metodos_pago_default()`, que es la función que el repo tiene para esto
-- (20260729150000), por DOS motivos independientes:
--
--   1. Esa función NO EXISTE en la base. Su migración está en el repo pero
--      nunca llegó a producción — verificado contra pg_proc al aplicar esta.
--      Es drift, del mismo tipo que documenta CLAUDE.md, y vale anotarlo acá
--      porque el próximo que lea el repo va a creer que existe.
--   2. Aunque existiera, no serviría desde el alta: inserta SIN negocio_id y
--      se apoya en el DEFAULT de la columna, que es
--      `security.current_negocio_id()` — la cookie de negocio activo del
--      usuario. En el momento del alta esa cookie todavía apunta al negocio
--      ANTERIOR (o a ninguno), así que sembraría los métodos en el negocio
--      equivocado.
--
-- comisión y acreditación en 0 en los tres, igual que el seed: son los valores
-- de arranque razonables y cada comercio ajusta los suyos en Configuración.
-- Poner un 3,5% inventado sería peor que un 0 visible.

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

    INSERT INTO public.negocios (
      nombre, slug, estado, plan_id, plan_vencimiento, rubro_comercial, tamano_equipo
    )
    VALUES (
      p_nombre, p_slug, 'activo', v_plan, now() + interval '14 days',
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

    -- Los tres de arranque. `negocio_id` va EXPLÍCITO y no por el default de la
    -- columna: ver el encabezado de esta migración.
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

