-- ============================================================================
-- MAILS POR ETAPA DEL EMBUDO DE ALTA
-- ============================================================================
--
-- `embudo_de_alta` (20260909120000) dice dónde quedó parada cada persona que
-- se registró. Lo que faltaba era poder hacer algo con eso: escribirle al que
-- no confirmó el mail una cosa, y al que confirmó y no creó su negocio otra.
--
-- Dos tablas, y las dos existen por un motivo distinto:
--
--   `envios_email` es el REGISTRO de lo que ya salió. Sin él, "¿a esta persona
--   ya le escribí?" se contesta abriendo la casilla propia, y el mismo mail se
--   manda dos veces. El unique parcial lo hace imposible: la segunda vez
--   rebota con 23505 en vez de duplicar. Es la misma forma que el guard de
--   `importaciones_productos` y por el mismo motivo — reenviar a propósito
--   existe (`forzado`), reenviar sin querer no.
--
--   `email_bajas` es quién NO quiere más mails. Va por DIRECCIÓN y no por
--   usuario porque una baja es de la casilla: si la persona se borra la cuenta
--   y se registra de nuevo, la baja sigue valiendo. Se consulta ANTES de cada
--   envío, así que una baja apaga también las campañas que todavía no existen.
--
-- Estos NO son mails de auth: los de confirmación y magic link los sigue
-- mandando Supabase. Estos los manda la app con su propio proveedor, uno por
-- uno y a mano desde /admincomerz.
-- ============================================================================

create table if not exists public.envios_email (
  id uuid primary key default gen_random_uuid(),
  -- Sin FK a auth.users, mismo criterio que `usuarios_prueba`: el registro de
  -- que se le escribió a alguien tiene que sobrevivir a que esa cuenta se
  -- borre. Un mail que salió, salió.
  usuario_id uuid not null,
  -- Congelada en la fila, no leída por join: si mañana la persona cambia su
  -- dirección, este envío tiene que seguir diciendo a dónde fue. Mismo
  -- criterio que los datos del receptor en `comprobantes`.
  email text not null,
  -- Qué campaña. La lista vive en TypeScript (`campanas-email.ts`), no en un
  -- CHECK: agregar una campaña no puede necesitar una migración.
  campana text not null,
  -- En qué escalón estaba cuando se le escribió. Es lo que permite leer
  -- después "le escribí estando en SESION y creó el negocio al otro día".
  etapa text not null,
  -- Id que devuelve el proveedor. Es con lo que se rastrea un envío en su
  -- panel cuando alguien dice que no le llegó.
  proveedor_id text,
  forzado boolean not null default false,
  enviado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

comment on table public.envios_email is
  'Mails de ciclo de vida que salieron desde /admincomerz, uno por envío. NO incluye los de auth (confirmación, magic link), que los manda Supabase. Ver 20260910120000.';
comment on column public.envios_email.usuario_id is
  'auth.users.id. SIN FK: el registro del envío sobrevive a que la cuenta se borre.';
comment on column public.envios_email.etapa is
  'Escalón del embudo AL MOMENTO del envío, congelado. La etapa actual se recalcula y ya no serviría para evaluar la campaña.';

-- Un mail por persona por campaña. `where not forzado` deja la puerta abierta
-- al reenvío explícito sin abrirla al accidental.
create unique index if not exists idx_envios_email_campana_unica
  on public.envios_email (usuario_id, campana)
  where not forzado;

create index if not exists idx_envios_email_usuario
  on public.envios_email (usuario_id, creado_en desc);

alter table public.envios_email enable row level security;

-- Dato de Comerz, no de un tenant: sin `negocio_id` y sin policy de negocio.
create policy envios_email_super_admin on public.envios_email
  for all
  using (security.is_super_admin())
  with check (security.is_super_admin());

revoke all on public.envios_email from anon;
-- DELETE existe solo para el rollback del propio envío: la fila se inserta
-- ANTES de mandar (es el guard de idempotencia) y si el proveedor falla hay que
-- poder sacarla, o el reintento quedaría bloqueado por un mail que no salió.
grant select, insert, delete on public.envios_email to authenticated;

-- ============================================================================

create table if not exists public.email_bajas (
  email text primary key,
  motivo text,
  creado_en timestamptz not null default now()
);

comment on table public.email_bajas is
  'Direcciones que pidieron no recibir más mails de Comerz. Se consulta antes de cada envío. Por dirección y no por usuario: la baja es de la casilla. Ver 20260910120000.';

alter table public.email_bajas enable row level security;

-- Nadie la escribe directo: el que se da de baja no está logueado, y abrirle
-- INSERT a anon sería un formulario para dar de baja la casilla de otro. La
-- única puerta es la función de abajo, que exige el id del envío.
create policy email_bajas_super_admin on public.email_bajas
  for all
  using (security.is_super_admin())
  with check (security.is_super_admin());

revoke all on public.email_bajas from anon, authenticated;
-- SELECT sí: el panel tiene que poder decir "esta persona pidió no recibir
-- mails" antes de ofrecer el botón, y la RLS ya lo acota al super admin. Lo
-- que no se otorga es INSERT — dar de baja pasa siempre por la función.
grant select on public.email_bajas to authenticated;

-- ============================================================================
-- LA BAJA
-- ============================================================================
--
-- El link de "no quiero recibir más" viaja en el pie del mail y lo abre gente
-- sin sesión. Lo que lo protege no es un login sino el propio id del envío:
-- es un uuid v4 aleatorio que solo está en ESE mail, así que quien lo tiene es
-- quien lo recibió. No se puede dar de baja una dirección que no sea la del
-- envío — la dirección sale de la fila, nunca del parámetro.
--
-- SECURITY DEFINER porque `email_bajas` no le da INSERT a nadie; lo que la
-- acota es que no recibe el mail a dar de baja. Mismo criterio que
-- `registrar_paso_onboarding` (20260909140000).
--
-- Idempotente: abrir el link dos veces no es un error, es una persona que
-- volvió a hacer click.
-- ============================================================================
create or replace function public.dar_de_baja_mails(p_envio_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  select e.email into v_email
  from public.envios_email e
  where e.id = p_envio_id;

  if v_email is null then
    return null;
  end if;

  insert into public.email_bajas (email, motivo)
  values (v_email, 'link del pie del mail')
  on conflict (email) do nothing;

  return v_email;
end;
$$;

comment on function public.dar_de_baja_mails(uuid) is
  'Da de baja la dirección de UN envío, identificada por el uuid del envío. La dirección sale de la fila, nunca del parámetro. Ver 20260910120000.';

grant execute on function public.dar_de_baja_mails(uuid) to anon, authenticated;

-- ============================================================================

do $$
begin
  if has_table_privilege('anon', 'public.envios_email', 'select') then
    raise exception 'GUARD: anon puede leer envios_email';
  end if;

  if has_table_privilege('anon', 'public.email_bajas', 'insert') then
    raise exception 'GUARD: anon puede escribir email_bajas directo (tiene que pasar por dar_de_baja_mails)';
  end if;

  -- Las DOS tablas, no "alguna": con un `in (...)` sin contar, una tabla
  -- abierta pasa el guard porque la otra está bien.
  if (
    select count(distinct tablename) from pg_policies
    where tablename in ('envios_email', 'email_bajas')
      and qual like '%is_super_admin%'
  ) <> 2 then
    raise exception 'GUARD: falta el corte de super admin en alguna de las dos tablas';
  end if;

  if not exists (
    select 1 from pg_indexes
    where indexname = 'idx_envios_email_campana_unica'
  ) then
    raise exception 'GUARD: sin el unique parcial, el mismo mail sale dos veces';
  end if;
end $$;
