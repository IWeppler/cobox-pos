-- ============================================================================
-- EL CICLO DE VIDA DE CADA COMERCIO, EN HECHOS
-- ============================================================================
--
-- `embudo_de_alta` (20260909120000) termina donde el negocio se crea. Desde
-- ahí en adelante el ciclo tiene cuatro momentos que piden un mail distinto —
-- fin de prueba, prueba vencida, aviso de cobro e inactividad— y todos
-- necesitan los mismos hechos: cuándo vence, qué cargó, cuándo vendió por
-- última vez y a qué dirección escribirle.
--
-- Devuelve HECHOS, no decisiones: acá no hay ningún "está por vencer". Cuántos
-- días antes se avisa, qué pasa con el que no cargó nada y a quién no se le
-- escribe se decide en `features/admin/lib/campanas-negocio.ts`, que tiene
-- tests. Mismo criterio que `funnel_comerz` y `embudo_de_alta`.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ SECURITY DEFINER
--
-- Cruza los 10 negocios del SaaS con el mail de sus dueños, o sea que por
-- definición mira fuera del negocio activo de quien pregunta. La RLS de
-- `negocios` lo impediría, y está bien que lo impida. **El
-- `where security.is_super_admin()` del final es lo ÚNICO que la protege**:
-- definer apaga la RLS, así que sin ese filtro cualquier usuario autenticado
-- se llevaría el mail de todos los dueños y las ventas de todos los comercios.
-- Misma forma exacta que las otras dos, y no se toca sin entender esto.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ EL DUEÑO Y NO "LOS USUARIOS"
--
-- `usuarios_negocios.es_owner`. Un aviso de cobro que le llega a la vendedora
-- es información de la caja del comercio en la casilla de una empleada, y un
-- "se te vence la prueba" al que no decide no sirve para nada. Si hay más de
-- un owner se toma el más viejo: es el que creó el negocio.
-- ============================================================================

create or replace function public.ciclo_de_vida_negocios()
returns table (
  negocio_id uuid,
  nombre text,
  estado text,
  creado timestamptz,
  plan_vencimiento timestamptz,
  plan_nombre text,
  plan_precio numeric,
  duenio_id uuid,
  duenio_email text,
  productos integer,
  ventas integer,
  ultima_venta timestamptz,
  pagos integer
)
language sql
stable
security definer
set search_path to 'public', 'security'
as $$
  select
    n.id as negocio_id,
    n.nombre::text,
    n.estado::text,
    n.created_at as creado,
    n.plan_vencimiento,
    p.nombre::text as plan_nombre,
    p.precio_mensual as plan_precio,
    d.usuario_id as duenio_id,
    d.email::text as duenio_email,
    -- Cuánto cargó. Es lo que separa al que probó de verdad del que entró y se
    -- fue, y lo que hace que el mail de fin de prueba pueda decir algo
    -- concreto en vez de "esperamos que lo hayas disfrutado".
    (select count(*)::int from public.productos pr where pr.negocio_id = n.id) as productos,
    (select count(*)::int from public.ventas v where v.negocio_id = n.id) as ventas,
    (select max(v.fecha_venta) from public.ventas v where v.negocio_id = n.id) as ultima_venta,
    -- Si ya pagó alguna vez. Un comercio con cero pagos que llega al
    -- vencimiento es una prueba que termina; con pagos es una renovación.
    (select count(*)::int from public.pagos_suscripcion ps where ps.negocio_id = n.id) as pagos
  from public.negocios n
  left join public.planes p on p.id = n.plan_id
  left join lateral (
    select un.usuario_id, pe.email
    from public.usuarios_negocios un
    join public.perfiles pe on pe.id = un.usuario_id
    where un.negocio_id = n.id and un.es_owner
    order by un.created_at asc
    limit 1
  ) d on true
  where security.is_super_admin();
$$;

comment on function public.ciclo_de_vida_negocios() is
  'Hechos del ciclo de vida de cada comercio (vencimiento, uso, dueño) para decidir qué mail le toca. SECURITY DEFINER: el where is_super_admin() es lo único que la protege. Ver 20260910130000.';

-- PUBLIC primero: sin esto anon ejecuta igual, porque hereda el execute que
-- Postgres le da a PUBLIC por defecto en toda funcion nueva. El guard de abajo
-- lo detecto.
revoke all on function public.ciclo_de_vida_negocios() from public, anon;
grant execute on function public.ciclo_de_vida_negocios() to authenticated;

do $$
declare
  v_cuerpo text := pg_get_functiondef('public.ciclo_de_vida_negocios()'::regprocedure);
begin
  if v_cuerpo not like '%is_super_admin%' then
    raise exception 'GUARD: ciclo_de_vida_negocios quedo sin el filtro de super admin y expone el mail de todos los duenios';
  end if;

  if has_function_privilege('anon', 'public.ciclo_de_vida_negocios()', 'execute') then
    raise exception 'GUARD: anon puede ejecutar ciclo_de_vida_negocios';
  end if;
end $$;
