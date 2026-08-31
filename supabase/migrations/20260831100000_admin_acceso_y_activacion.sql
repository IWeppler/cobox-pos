-- Tres cosas que el panel de Comerz no podía contestar sobre un comercio nuevo:
-- si pudo ENTRAR después de confirmar el mail, si terminó el ONBOARDING, y por
-- dónde escribirle.
--
-- 1. ACCESO. `auth.users.email_confirmed_at` dice que confirmó, pero no que
--    haya podido usar la app: el link de confirmación ABRE sesión, así que
--    "tiene sesión" da true aunque haya cerrado la pestaña y no haya vuelto
--    nunca. Lo que separa los dos casos es CUÁNDO fue la última actividad
--    contra cuándo confirmó. Medido el 30/8/2026: PequeñasGigantes confirmó
--    13:22:00 y su sesión nació 13:22:21 —21 segundos, o sea el link— pero
--    siguió activa hasta las 22:55, que es lo que prueba que entró de verdad.
--
--    OJO con `auth.sessions`: guarda SOLO las sesiones vivas. Dos comercios
--    que entraron en agosto tienen cero filas ahí porque su sesión venció, y
--    la sesión más vieja de Estilo Bonito nació hoy — no es su primer ingreso.
--    Por eso el último ingreso sale de `auth.users.last_sign_in_at`, que es
--    persistente, y las sesiones solo aportan su `updated_at` (el refresh del
--    token, o sea uso real) para correr la última actividad hacia adelante.
--
--    `auth.audit_log_entries` habría sido la fuente ideal —un evento por
--    login— pero está VACÍA en este proyecto, así que no se puede contar
--    cuántas veces entró: se informa cuándo fue la última.
--
-- 2. ONBOARDING. `estado_activacion()` ya calcula los pasos, pero para el
--    negocio ACTIVO del que llama: el super admin no tiene el negocio de otro
--    activo, y ninguna de sus subconsultas filtra por negocio (se apoya en la
--    RLS). Acá va la misma lógica con el negocio EXPLÍCITO, para poder pedirla
--    de cualquiera. Las dos tienen que decir lo mismo; si una cambia, cambia
--    la otra.
--
-- 3. WHATSAPP. No hay teléfono del dueño en ningún lado —`perfiles` no tiene
--    columna y `auth.users.phone` está en null en los 7 usuarios— así que el
--    único número real es `configuracion_pos.whatsapp`, el del comercio. Está
--    cargado en los 7 negocios porque el onboarding lo pide en el primer paso.
--    Es el número del local, no el personal del dueño; para escribirle
--    alcanza.
--
-- SECURITY DEFINER con corte por `security.is_super_admin()`, mismo criterio
-- que `comercios_con_uso`: definer se saltea RLS, así que el `where` es lo
-- único que protege esto.

-- --------------------------------------------------------------------------
-- Estado de activación de UN negocio, sin depender del negocio activo.
-- --------------------------------------------------------------------------
create or replace function public.estado_activacion_de(p_negocio uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'security', 'pg_temp'
as $$
  select case
    when not security.is_super_admin() then null::jsonb
    else jsonb_build_object(
      'rubro', coalesce(
        (select c.rubro from public.configuracion_pos c
          where c.negocio_id = p_negocio limit 1),
        'indumentaria'
      ),
      'marca', coalesce((
        select coalesce(btrim(c."posLogo"), '') <> ''
           and coalesce(btrim(c.whatsapp), '') <> ''
        from public.configuracion_pos c where c.negocio_id = p_negocio limit 1
      ), false),
      'metodos_pago', exists (
        select 1 from public.metodos_pago m
        where m.negocio_id = p_negocio and m.activo
      ),
      'productos', exists (
        select 1 from public.productos p where p.negocio_id = p_negocio
      ),
      -- Mismo coalesce que la original: `producto_variantes.precio` es un
      -- OVERRIDE y vale 0 salvo que la variante cueste distinto del producto.
      'stock_y_precios', exists (
        select 1
        from public.producto_variantes v
        join public.productos p on p.id = v.producto_id
        where v.negocio_id = p_negocio
          and v.activa
          and v.stock > 0
          and coalesce(nullif(v.precio, 0), p.precio, 0) > 0
      ),
      'empleados', (
        select count(*) > 1 from public.usuarios_negocios u
        where u.negocio_id = p_negocio
      ),
      'catalogo_publicado', coalesce((
        select c.catalogo_activo from public.configuracion_pos c
        where c.negocio_id = p_negocio limit 1
      ), false) and exists (
        select 1 from public.productos p
        where p.negocio_id = p_negocio and p.publicado
      ),
      'caja', exists (
        select 1 from public.turnos_caja t where t.negocio_id = p_negocio
      ),
      'primera_venta', exists (
        select 1 from public.ventas ven where ven.negocio_id = p_negocio
      )
    )
  end;
$$;

comment on function public.estado_activacion_de(uuid) is
  'Espejo de estado_activacion() con el negocio explícito, para el panel de '
  'Comerz. Solo super admin. Las dos tienen que devolver lo mismo para el '
  'mismo negocio: la lógica de qué es "activado" vive en TS '
  '(calcularProgresoActivacion) y consume este jsonb.';

grant execute on function public.estado_activacion_de(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- La tabla del panel, ahora con acceso, activación y WhatsApp.
-- --------------------------------------------------------------------------
drop function if exists public.comercios_con_uso();

create or replace function public.comercios_con_uso()
returns table(
  id uuid, nombre text, slug text, estado text, duenio text,
  plan_id uuid, plan_nombre text, plan_precio numeric,
  plan_vencimiento timestamptz,
  usuarios bigint, clientes_cc bigint, productos bigint,
  max_usuarios integer, max_clientes_cc integer, max_productos integer,
  rubro text, ventas_7d bigint, monto_7d numeric,
  email_confirmado_en timestamptz,
  ultimo_ingreso timestamptz,
  ultima_actividad timestamptz,
  whatsapp text,
  activacion jsonb
)
language sql
stable
security definer
set search_path to 'public', 'security', 'pg_temp'
as $$
  with owner as (
    select un.negocio_id, un.usuario_id
    from public.usuarios_negocios un
    where un.es_owner
  )
  select
    n.id,
    n.nombre,
    n.slug,
    n.estado,
    (select p.email from owner o join public.perfiles p on p.id = o.usuario_id
      where o.negocio_id = n.id limit 1) as duenio,
    n.plan_id,
    pl.nombre as plan_nombre,
    coalesce(pl.precio_mensual, 0) as plan_precio,
    n.plan_vencimiento,
    (select count(*) from public.usuarios_negocios u where u.negocio_id = n.id),
    (select count(*) from public.clientes c
      where c.negocio_id = n.id and c.saldo_pendiente > 0),
    (select count(*) from public.productos pr where pr.negocio_id = n.id),
    nullif(public.reglas_negocio(n.id) ->> 'max_usuarios', 'null')::int,
    nullif(public.reglas_negocio(n.id) ->> 'max_clientes_cuenta_corriente', 'null')::int,
    nullif(public.reglas_negocio(n.id) ->> 'max_productos', 'null')::int,
    (select c.rubro from public.configuracion_pos c where c.negocio_id = n.id limit 1) as rubro,
    -- Actividad de los ultimos 7 dias: es la senal de si el comercio USA el
    -- sistema, que no es lo mismo que si paga. Las ANULADAS no cuentan: una
    -- venta anulada no es actividad, es una correccion.
    (select count(*) from public.ventas v
      where v.negocio_id = n.id
        and v.estado_operacion <> 'ANULADA'
        and v.fecha_venta >= now() - interval '7 days') as ventas_7d,
    (select coalesce(sum(v.total), 0) from public.ventas v
      where v.negocio_id = n.id
        and v.estado_operacion <> 'ANULADA'
        and v.fecha_venta >= now() - interval '7 days') as monto_7d,
    (select u.email_confirmed_at from owner o
      join auth.users u on u.id = o.usuario_id
      where o.negocio_id = n.id limit 1) as email_confirmado_en,
    (select u.last_sign_in_at from owner o
      join auth.users u on u.id = o.usuario_id
      where o.negocio_id = n.id limit 1) as ultimo_ingreso,
    -- El mayor entre el último login y el último refresh de token: una sesión
    -- abierta hace tres días que sigue renovando es actividad de hoy, y un
    -- login de hoy sin sesión viva también.
    greatest(
      (select u.last_sign_in_at from owner o
        join auth.users u on u.id = o.usuario_id
        where o.negocio_id = n.id limit 1),
      (select max(s.updated_at) from owner o
        join auth.sessions s on s.user_id = o.usuario_id
        where o.negocio_id = n.id)
    ) as ultima_actividad,
    (select c.whatsapp from public.configuracion_pos c
      where c.negocio_id = n.id limit 1) as whatsapp,
    public.estado_activacion_de(n.id) as activacion
  from public.negocios n
  left join public.planes pl on pl.id = n.plan_id
  -- SECURITY DEFINER: sin este filtro la funcion mostraria TODOS los negocios
  -- a cualquiera que la llame. El corte es explicito y es lo unico que la
  -- protege, porque definer se saltea RLS.
  where security.is_super_admin()
  order by n.created_at;
$$;

comment on function public.comercios_con_uso() is
  'La tabla del panel de Comerz: uso contra límites, actividad, acceso del '
  'dueño (confirmación de mail + sesiones) y estado de onboarding. Solo '
  'super admin.';

grant execute on function public.comercios_con_uso() to authenticated;
