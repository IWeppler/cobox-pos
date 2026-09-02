-- El criterio de super admin pasa a estar UNA sola vez, parametrizado por
-- usuario: `security.es_super_admin(p_user_id)`.
--
-- POR QUÉ. Hoy el criterio vive adentro de `security.is_super_admin()`, que lo
-- evalúa contra `auth.uid()`. Eso alcanza mientras todo lo que pregunta corre
-- dentro de una request con sesión, que es el caso de la app y de la RLS.
--
-- Deja de alcanzar con el custom access token hook: ese lo invoca el servidor
-- de Auth, NO una request de PostgREST, y ahí no hay contexto de sesión.
-- Verificado en producción, en una conexión sin request:
--
--   auth.uid() .......................... null
--   request.headers / cookies / jwt ..... null
--   security.current_negocio_id() ....... null
--   public.rol_actual() ................. null
--
-- O sea que el hook no puede llamar a `is_super_admin()`: siempre le daría
-- false. La salida fácil sería copiar el criterio adentro del hook, y esa es
-- exactamente la que no hay que tomar — serían DOS definiciones de un
-- privilegio, que es el peor lugar posible para una divergencia. El día que
-- cambie el criterio (que hoy es un email hardcodeado, o sea que va a
-- cambiar), quien toque una sola de las dos deja la otra mintiendo.
--
-- Este cambio va SOLO y ANTES del hook, no adentro. Si algo se rompiera con
-- los dos cambios juntos en producción no se sabría cuál fue.
--
-- QUÉ NO CAMBIA: el comportamiento. `is_super_admin()` conserva firma,
-- permisos y respuesta; ahora delega en vez de tener el criterio adentro. Las
-- 12 policies y las 7 funciones que la llaman no se tocan.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ LA EXTERNA DEJA DE SER `SECURITY DEFINER`. Esto no es cosmético y
-- se decidió MIDIENDO, después de que la primera versión estuviera mal.
--
-- 11 de las 12 policies invocan `security.is_super_admin()` EN CRUDO, o sea
-- una vez por FILA, no como subconsulta escalar. Es la misma forma que en
-- 20260816100000 costó 132 ms contra 4 ms. Así que una capa de más se paga
-- por fila.
--
-- La primera versión de esta migración dejaba la externa como `security
-- definer` + `set search_path`, con un comentario que afirmaba que Postgres
-- iba a inlinearla. Es FALSO: una función SQL con `SECURITY DEFINER` o con
-- cláusula `SET` no se puede inlinear nunca — necesita el cambio de
-- privilegio y el guardado/restaurado del GUC en cada llamada. Medido sobre
-- 20.000 llamadas en producción:
--
--   externa sin definer ni SET (esta) ....... 10,89 µs/llamada
--   la que hay hoy (criterio adentro) ....... 12,79 µs   (1,17x)
--   externa con definer + SET ............... 98,69 µs   (9,06x)
--
-- La externa no necesita ser definer porque no hace nada privilegiado: leer
-- `auth.users` es lo privilegiado, y eso queda en la interna, que SÍ es
-- definer. Sin definer y sin `SET`, la externa se inlinea y desaparece del
-- plan: queda UNA sola llamada no inlineable, igual que hoy.
--
-- Y sin `SET search_path` no hay riesgo de inyección porque el cuerpo está
-- todo calificado (`security.es_super_admin`, `auth.uid`): un search_path
-- hostil no puede redirigir una llamada con esquema explícito.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function security.es_super_admin(p_user_id uuid)
returns boolean
language sql
stable
parallel safe
security definer
set search_path to ''
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = p_user_id
       and u.email = 'ignacionweppler@gmail.com'
  );
$$;

comment on function security.es_super_admin(uuid) is
  'Unico lugar donde vive el criterio de super admin de Comerz. Recibe el usuario en vez de leerlo de la sesion, para que tambien lo pueda usar el custom access token hook, que corre sin contexto de request. Ver 20260903100000.';

-- Sin `security definer` y sin `set` A PROPOSITO: es lo que permite que el
-- planner la inline. Ver el bloque de arriba.
create or replace function security.is_super_admin()
returns boolean
language sql
stable
parallel safe
as $$
  select security.es_super_admin(auth.uid());
$$;

comment on function security.is_super_admin() is
  'El super admin de la sesion actual. Delega en security.es_super_admin(auth.uid()) desde 20260903100000: el criterio vive en un solo lugar. NO es security definer a proposito (la interna si lo es): asi el planner la inlinea y no agrega costo por fila a las 11 policies que la llaman en crudo.';

-- La interna necesita los mismos permisos que tenia la externa
-- (postgres + authenticated): es la que de verdad lee `auth.users`, y ahora
-- todo el que llame a `is_super_admin()` termina llamandola a ella.
revoke all on function security.es_super_admin(uuid) from public;
grant execute on function security.es_super_admin(uuid) to authenticated;

-- Guard 1: el criterio da EXACTAMENTE lo mismo que antes, para todos.
do $$
declare
  v_discrepan int;
begin
  select count(*) into v_discrepan
    from auth.users u
   where security.es_super_admin(u.id)
      <> (u.email = 'ignacionweppler@gmail.com');

  if v_discrepan > 0 then
    raise exception
      'es_super_admin difiere del criterio anterior en % usuarios.', v_discrepan;
  end if;
end $$;

-- Guard 2: la externa NO puede quedar como definer ni con SET, o vuelve la
-- regresion de 9x medida arriba. Es facil de reintroducir sin querer.
do $$
declare
  v_definer boolean;
  v_config  text[];
begin
  select p.prosecdef, p.proconfig
    into v_definer, v_config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'security' and p.proname = 'is_super_admin';

  if v_definer then
    raise exception 'is_super_admin quedo como SECURITY DEFINER: no se inlinea.';
  end if;

  if v_config is not null then
    raise exception 'is_super_admin quedo con cláusula SET (%): no se inlinea.', v_config;
  end if;
end $$;
