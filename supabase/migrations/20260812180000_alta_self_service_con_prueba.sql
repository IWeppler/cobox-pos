-- Alta self-service: el comercio elige plan y arranca con 14 días de prueba.
--
-- Hasta acá `crear_negocio_con_owner` no tocaba `plan_id` ni `plan_vencimiento`.
-- Con los 4 negocios actuales no se notaba —el plan se asignaba a mano desde
-- /admincomerz— pero el primer negocio creado por un usuario solo habría
-- nacido con `plan_id` NULL, y ahí los topes por plan no tienen qué leer:
-- `planes.reglas` (max_usuarios, max_sucursales, features) simplemente no
-- existiría para ese comercio. Es el tipo de agujero que aparece recién cuando
-- el comercio número 5 intenta invitar a su segundo empleado.
--
-- Decisiones que quedan grabadas acá:
--
--   * El plan es OBLIGATORIO en el alta. No hay "después elegís": sin plan no
--     hay reglas, y un comercio sin reglas es un comercio sin límites.
--   * La prueba son 14 días desde el alta, en `plan_vencimiento`. No hay estado
--     "trial" aparte: un negocio en prueba es un negocio activo con
--     vencimiento, que es lo que /admincomerz ya sabe leer (`vencido`,
--     `porVencer`). Un estado más sería otra cosa que mantener sincronizada.
--   * Vencer NO suspende solo. La suspensión sigue siendo una decisión humana
--     desde el panel (`cambiarEstadoNegocioAction`). Cortarle el POS a un
--     comercio automáticamente un domingo a la noche, por una tarjeta que no
--     entró, es peor que cobrarle tarde.
--
-- El parámetro va con DEFAULT NULL para no romper llamadas viejas de 3
-- argumentos, pero si llega NULL se resuelve al plan más barato en vez de
-- dejar el negocio sin reglas.

create or replace function public.crear_negocio_con_owner(
  p_nombre text,
  p_slug text,
  p_whatsapp text,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_user      uuid := auth.uid();
    v_negocio   uuid;
    v_rol_admin uuid;
    v_plan      uuid;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesión para crear un negocio';
    END IF;

    -- Plan elegido, validado contra la tabla y contra `activo`: un id inventado
    -- desde el cliente —o el de un plan que se dio de baja— no puede dejar el
    -- negocio sin reglas. Si no resuelve, cae al primero del orden de la
    -- grilla, que es el de entrada.
    SELECT id INTO v_plan
    FROM public.planes
    WHERE id = p_plan_id AND activo;

    IF v_plan IS NULL THEN
        SELECT id INTO v_plan
        FROM public.planes
        WHERE activo
        ORDER BY orden ASC NULLS LAST, precio_mensual ASC
        LIMIT 1;
    END IF;

    IF v_plan IS NULL THEN
        RAISE EXCEPTION 'No hay ningún plan activo para asignarle al negocio';
    END IF;

    INSERT INTO public.negocios (nombre, slug, estado, plan_id, plan_vencimiento)
    VALUES (p_nombre, p_slug, 'activo', v_plan, now() + interval '14 days')
    RETURNING id INTO v_negocio;

    INSERT INTO public.roles (nombre, negocio_id, es_sistema)
    VALUES ('ADMIN', v_negocio, true),
           ('ENCARGADO', v_negocio, true),
           ('VENDEDOR', v_negocio, true);

    SELECT id INTO v_rol_admin FROM public.roles
    WHERE negocio_id = v_negocio AND nombre = 'ADMIN';

    -- El ADMIN recibe TODAS las filas de `permisos`: es lo que hace que un
    -- permiso nuevo llegue solo a los negocios nuevos.
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
$$;
