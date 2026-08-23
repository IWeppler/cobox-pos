-- Un estado propio para el período de prueba.
--
-- Hasta acá "estar en prueba" se DEDUCÍA: un negocio en prueba era uno activo
-- con `plan_vencimiento` cerca del alta (ver 20260812180000, que lo decidió
-- así a propósito para no tener otra cosa que mantener sincronizada).
--
-- Por qué cambia: esa deducción dependía de una fecha que se toca. Cuando la
-- migración 20260803010000 sembró `plan_vencimiento = now() + 12 months`, el
-- panel dejó de ver a nadie en prueba y nadie se enteró por meses. Un estado
-- explícito no se desincroniza con una fecha.
--
-- QUÉ SEPARA A `prueba` DE `activo`: el COBRO, no el acceso.
--   * `prueba` = todavía no pagó nunca. Pasa a `activo` con el primer pago.
--   * El corte por FECHA es otro eje y vive en `plan_vencimiento`. Una prueba
--     vencida sigue siendo `prueba`, con su vencimiento en el pasado — que es
--     justamente el caso que hay que ver.
--
-- CUIDADO, LA PARTE QUE PUEDE ROMPER: `estado = 'activo'` no era una etiqueta,
-- GATEABA ACCESOS. Si `prueba` no entrara en cada uno de estos lugares, el
-- comercio en prueba no podría probar nada:
--   1. `security.negocio_publico()` → su catálogo daría 404.
--   2. policy `negocios_select_anon_activo` → lo mismo, por RLS.
--   3. `shared/lib/tenant.ts` → 404 del lado de Next.
--   4. `features/auth/actions/negocios.ts` → no le aparecería en su propio
--      selector de negocios, o sea que el dueño no podría entrar al panel.
-- Los cuatro se actualizaron. El espejo en código es
-- `shared/lib/estado-negocio.ts`.

alter table public.negocios drop constraint negocios_estado_check;
alter table public.negocios
  add constraint negocios_estado_check
  check (estado = any (array['activo'::text, 'prueba'::text, 'suspendido'::text, 'cancelado'::text]));

create or replace function security.negocio_publico()
returns uuid
language plpgsql
stable parallel safe security definer
set search_path to 'public'
as $function$
DECLARE
    v_slug text;
    v_id   uuid;
BEGIN
    BEGIN
        v_slug := current_setting('request.headers', true)::json ->> 'x-negocio-slug';
    EXCEPTION WHEN OTHERS THEN
        v_slug := NULL;
    END;

    IF v_slug IS NULL OR v_slug = '' THEN
        RETURN NULL;
    END IF;

    -- 'prueba' entra igual que 'activo': durante la prueba la tienda funciona.
    SELECT id INTO v_id FROM public.negocios
    WHERE slug = v_slug AND estado IN ('activo', 'prueba');

    RETURN v_id;
END;
$function$;

alter policy negocios_select_anon_activo on public.negocios
  using (estado in ('activo', 'prueba'));

-- El alta self-service nace en prueba, que es lo que realmente es.
create or replace function public.crear_negocio_con_owner(
  p_nombre text,
  p_slug text,
  p_plan text default null,
  p_modalidad text default 'mensual'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_negocio uuid;
    v_plan    uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sin sesion' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_plan FROM public.planes
    WHERE lower(nombre) = lower(coalesce(p_plan, '')) AND activo
    LIMIT 1;

    IF v_plan IS NULL THEN
        SELECT id INTO v_plan FROM public.planes
        WHERE activo ORDER BY precio_mensual ASC LIMIT 1;
    END IF;

    INSERT INTO public.negocios (nombre, slug, estado, plan_id, plan_vencimiento, modalidad)
    VALUES (p_nombre, p_slug, 'prueba', v_plan, now() + interval '14 days', coalesce(p_modalidad, 'mensual'))
    RETURNING id INTO v_negocio;

    INSERT INTO public.usuarios_negocios (usuario_id, negocio_id, rol, es_owner)
    VALUES (auth.uid(), v_negocio, 'ADMIN', true);

    INSERT INTO public.rol_permisos_negocio (negocio_id, rol, permiso_id)
    SELECT v_negocio, 'ADMIN', p.id FROM public.permisos p;

    RETURN v_negocio;
END;
$function$;

-- Backfill: quien nunca pagó y no está cancelado, está en prueba.
update public.negocios n
set estado = 'prueba'
where n.estado = 'activo'
  and not exists (
    select 1 from public.pagos_suscripcion p where p.negocio_id = n.id
  );
