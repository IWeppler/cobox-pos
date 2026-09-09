-- ============================================================================
-- EL ÚNICO ESCALÓN DEL EMBUDO QUE NO SE PUEDE DEDUCIR
-- ============================================================================
--
-- `embudo_de_alta` (`20260909120000`) sale entero de `auth.users`: registro,
-- confirmación, sesión y negocio creado son fechas que ya existen. Falta uno,
-- y es el que importa: **si la persona llegó a VER el formulario del negocio**.
--
-- Sin eso, "sesión creada" y "abandonó el paso 2" se ven igual, y no lo son:
-- `last_sign_in_at` lo escribe Supabase al EMITIR el token del link del mail,
-- así que se marca aunque la persona no haya visto nada. El 9/9/2026, 6 de las
-- 10 cuentas sin negocio estaban en ese estado — parecían haber abandonado un
-- formulario que nunca se les mostró.
--
-- POR QUÉ UNA FUNCIÓN Y NO UN INSERT DIRECTO. La escribe alguien autenticado
-- que TODAVÍA NO TIENE NEGOCIO, y eso descarta las dos tablas que ya existen:
-- `eventos_uso.negocio_id` es NOT NULL con default `current_negocio_id()`, que
-- ahí devuelve null; y `eventos_comerz` solo la escribe el super admin.
--
-- La función es SECURITY DEFINER y por lo tanto se saltea la RLS: lo que la
-- acota es que NO recibe el usuario ni el negocio de quien llama. El
-- `usuario_id` sale de `auth.uid()` y el `negocio_id` va null siempre. Lo
-- único que se acepta de afuera es el nombre del paso, contra una lista
-- cerrada. O sea: nadie puede escribir un evento a nombre de otro.
--
-- IDEMPOTENTE por (usuario, paso): interesa CUÁNDO lo vio la primera vez, no
-- cuántas veces recargó. Sin eso, alguien que abre el onboarding diez veces
-- llena el feed de /admincomerz con diez filas iguales.
-- ============================================================================

create table if not exists public.onboarding_pasos_vistos (
  usuario_id uuid not null,
  paso text not null,
  visto_en timestamptz not null default now(),
  primary key (usuario_id, paso)
);

comment on table public.onboarding_pasos_vistos is
  'Cuándo vio cada paso del alta la primera vez. Es el único escalón del embudo que no se deduce de auth.users. Ver 20260909140000.';

alter table public.onboarding_pasos_vistos enable row level security;

-- Sin policies de escritura a propósito: la única puerta es
-- `registrar_paso_onboarding`, que no deja elegir a nombre de quién escribir.
-- Se lee desde `embudo_de_alta`, que ya corre como definer con su corte de
-- super admin.
create policy onboarding_pasos_select_propio on public.onboarding_pasos_vistos
  for select
  using (usuario_id = (select auth.uid()));

revoke all on public.onboarding_pasos_vistos from anon;
grant select on public.onboarding_pasos_vistos to authenticated;

create or replace function public.registrar_paso_onboarding(p_paso text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Sin sesión no hay a quién anotarle nada. No es error: el onboarding es
  -- ruta pública y el paso 1 se ve sin cuenta.
  if auth.uid() is null then
    return;
  end if;

  -- Lista CERRADA. El parámetro es lo único que viene de afuera, y sin esto
  -- sería texto libre escribiendo en una tabla que mira el panel.
  if p_paso not in ('PASO_2_NEGOCIO') then
    raise exception 'PASO_DESCONOCIDO: %', p_paso using errcode = 'P0001';
  end if;

  insert into public.onboarding_pasos_vistos (usuario_id, paso)
  values (auth.uid(), p_paso)
  on conflict (usuario_id, paso) do nothing;
end;
$$;

comment on function public.registrar_paso_onboarding(text) is
  'Anota que el usuario de la sesión vio un paso del alta. El usuario sale de auth.uid(), nunca del parámetro. Idempotente. Ver 20260909140000.';

revoke all on function public.registrar_paso_onboarding(text) from public, anon;
grant execute on function public.registrar_paso_onboarding(text) to authenticated;

-- ── El embudo pasa a devolver el escalón nuevo ──────────────────────────────
--
-- DROP y no CREATE OR REPLACE: agregar una columna al RETURNS TABLE cambia el
-- tipo de retorno, y Postgres lo rechaza con
-- `42P13: cannot change return type of existing function`. Va en la misma
-- transacción que el CREATE, así que no hay ventana en la que la función no
-- exista.
drop function if exists public.embudo_de_alta();

create function public.embudo_de_alta()
returns table (
  id uuid,
  email text,
  registrado timestamptz,
  confirmado timestamptz,
  ultima_sesion timestamptz,
  vio_formulario timestamptz,
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
    (
      select o.visto_en
      from public.onboarding_pasos_vistos o
      where o.usuario_id = u.id and o.paso = 'PASO_2_NEGOCIO'
    ) as vio_formulario,
    (
      select min(n.created_at)
      from public.usuarios_negocios un
      join public.negocios n on n.id = un.negocio_id
      where un.usuario_id = u.id and un.es_owner
    ) as negocio_creado,
    exists (
      select 1 from public.usuarios_negocios un where un.usuario_id = u.id
    ) as miembro_de_algun_negocio,
    exists (
      select 1
      from public.invitaciones i
      where lower(i.email) = lower(u.email) and i.estado = 'PENDIENTE'
    ) as invitacion_pendiente,
    security.es_super_admin(u.id) as es_super_admin
  from auth.users u
  where security.is_super_admin()
  order by u.created_at desc;
$$;

comment on function public.embudo_de_alta() is
  'Hechos crudos del embudo de alta (registro -> confirmacion -> sesion -> vio el formulario -> negocio), una fila por usuario de auth.users. Solo super admin. Las metricas se calculan en features/admin/lib/embudo-alta.ts. Ver 20260909120000 y 20260909140000.';

revoke all on function public.embudo_de_alta() from public, anon;
grant execute on function public.embudo_de_alta() to authenticated;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'embudo_de_alta';

  if position('security.is_super_admin()' in v_def) = 0 then
    raise exception
      'GUARD: embudo_de_alta quedo sin el filtro de super admin, y lee auth.users con SECURITY DEFINER';
  end if;

  if has_function_privilege('anon', 'public.embudo_de_alta()', 'execute')
     or has_function_privilege('anon', 'public.registrar_paso_onboarding(text)', 'execute') then
    raise exception 'GUARD: anon puede ejecutar una de las dos funciones';
  end if;

  -- Que la funcion no acepte el usuario de afuera es lo unico que impide
  -- escribir eventos a nombre de otro.
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'registrar_paso_onboarding';

  if position('auth.uid()' in v_def) = 0 then
    raise exception 'GUARD: registrar_paso_onboarding no toma el usuario de auth.uid()';
  end if;
end $$;
