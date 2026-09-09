-- ============================================================================
-- EL EMBUDO DE ANTES DEL NEGOCIO
-- ============================================================================
--
-- `funnel_comerz` arranca en `negocios.created_at`, o sea que su primer
-- escalón es "el negocio ya está creado". Todo lo anterior le es invisible, y
-- ahí es donde se pierde la gente.
--
-- Medido el 9/9/2026: CUATRO personas confirmaron el mail, iniciaron sesión y
-- nunca crearon su negocio (daitri94gallardo, debo_292, matidiazargentino21 y
-- khzev04, todas con `email_confirmed_at` y `last_sign_in_at` cargados y cero
-- filas en `usuarios_negocios`). Ninguna aparece en `funnel_comerz`, porque
-- para entrar a esa tabla hay que haber pasado justamente el paso donde se
-- cayeron. El panel las contaba como si no existieran, y por eso el
-- diagnóstico apuntaba al mail cuando el mail funcionaba.
--
-- Esta función devuelve HECHOS, no métricas: fechas y booleanos. Qué cuenta
-- como pérdida, a quién se excluye y cuál es el peor escalón se decide en
-- `features/admin/lib/embudo-alta.ts`, que tiene tests. Mismo criterio que
-- `funnel_comerz`, y por el mismo motivo: una cuenta con criterio adentro de
-- un `select` es una cuenta que nadie va a poder revisar después.
--
-- LEE `auth.users`, que es la razón de que sea SECURITY DEFINER: ese esquema
-- no está expuesto a PostgREST ni alcanzable por RLS. **El `where
-- security.is_super_admin()` es lo ÚNICO que la protege** — definer apaga la
-- RLS, así que sin ese filtro cualquier usuario autenticado se llevaría el
-- mail de todos los demás. Es la misma forma exacta que `funnel_comerz`, y no
-- se toca sin entender esto.
-- ============================================================================

create or replace function public.embudo_de_alta()
returns table (
  id uuid,
  email text,
  registrado timestamptz,
  confirmado timestamptz,
  ultima_sesion timestamptz,
  negocio_creado timestamptz,
  miembro_de_algun_negocio boolean,
  invitacion_pendiente boolean,
  es_super_admin boolean
)
language sql
stable
security definer
set search_path to 'public', 'auth', 'security'
as $$
  select
    u.id,
    u.email::text,
    u.created_at as registrado,
    u.email_confirmed_at as confirmado,
    u.last_sign_in_at as ultima_sesion,
    -- El alta del negocio que ESTE usuario creó. `es_owner` y no cualquier
    -- membresía: un empleado invitado no creó nada.
    (
      select min(n.created_at)
      from public.usuarios_negocios un
      join public.negocios n on n.id = un.negocio_id
      where un.usuario_id = u.id and un.es_owner
    ) as negocio_creado,
    exists (
      select 1 from public.usuarios_negocios un where un.usuario_id = u.id
    ) as miembro_de_algun_negocio,
    -- Un invitado que todavía no usó el link se ve idéntico a un dueño que
    -- abandonó. La invitación pendiente es el único rastro que los separa, y
    -- es el mismo criterio que usa `destinoSinNegocio` para decidir a dónde
    -- mandarlo cuando entra sin negocio.
    exists (
      select 1
      from public.invitaciones i
      where lower(i.email) = lower(u.email) and i.estado = 'PENDIENTE'
    ) as invitacion_pendiente,
    -- No hay columna de super admin en `perfiles`: la identidad la resuelve
    -- `security.es_super_admin(uuid)`, que es la misma que usa el resto del
    -- sistema. Preguntar por fila y no hardcodear el mail acá.
    security.es_super_admin(u.id) as es_super_admin
  from auth.users u
  where security.is_super_admin()
  order by u.created_at desc;
$$;

comment on function public.embudo_de_alta() is
  'Hechos crudos del embudo de alta (registro -> confirmacion -> sesion -> negocio), una fila por usuario de auth.users. Solo super admin. Las metricas se calculan en features/admin/lib/embudo-alta.ts. Ver 20260909120000.';

revoke all on function public.embudo_de_alta() from public, anon;
grant execute on function public.embudo_de_alta() to authenticated;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'embudo_de_alta';

  -- El corte es lo unico que separa "panel del dueno de Comerz" de "cualquier
  -- usuario se lleva el mail de todos". Si alguien reescribe el cuerpo y se lo
  -- olvida, que falle acá.
  if position('security.is_super_admin()' in v_def) = 0 then
    raise exception
      'GUARD: embudo_de_alta quedo sin el filtro de super admin, y lee auth.users con SECURITY DEFINER';
  end if;

  if has_function_privilege('anon', 'public.embudo_de_alta()', 'execute') then
    raise exception 'GUARD: anon puede ejecutar embudo_de_alta';
  end if;
end $$;
