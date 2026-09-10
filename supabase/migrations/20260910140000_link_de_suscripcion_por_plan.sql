-- ============================================================================
-- EL LINK DE PAGO ES DEL PLAN, NO DE COMERZ
-- ============================================================================
--
-- La primera versión de los mails de cobro (20260910120000 + 130000) leía un
-- único link de una variable de entorno. Sirve para un link de pago suelto,
-- donde el importe lo pone quien paga.
--
-- Con SUSCRIPCIÓN de Mercado Pago no alcanza: el importe de una suscripción es
-- FIJO, así que hay un link de adhesión POR PLAN — Emprendedor $30.000,
-- Gestión $50.000, Empresa $70.000. Un solo link mandaría a todo el mundo a
-- adherirse al importe de otro.
--
-- Va en la tabla y no en tres variables de entorno por dos motivos: es un dato
-- del plan (vive al lado de su precio, y si mañana cambia el precio hay que
-- cambiar los dos juntos), y cambiarlo no puede necesitar un deploy.
--
-- `null` significa "este plan no tiene link", y las campañas de cobro de un
-- comercio con ese plan no se arman. Fail-closed a propósito: un aviso de cobro
-- sin cómo pagar es trabajo para el que lo recibe.
-- ============================================================================

alter table public.planes
  add column if not exists link_suscripcion text;

comment on column public.planes.link_suscripcion is
  'Link de adhesión a la suscripción de Mercado Pago para este plan. Lo usan los mails de cobro; null = ese plan no tiene link y el mail no se manda. Ver 20260910140000.';

-- ============================================================================
-- La función de ciclo de vida pasa a devolverlo.
--
-- Se reescribe desde el cuerpo VIVO y no desde el archivo de 20260910130000
-- (que es idéntico hoy, pero esa es exactamente la suposición que costó las
-- unidades de serie el 4/9: `create or replace function` no avisa de nada).
-- El único cambio contra el cuerpo vivo es la columna `plan_link`.
--
-- Va DROP y no `create or replace`: agregar una columna al `returns table`
-- cambia el tipo de retorno, y Postgres lo rechaza con 42P13 ("cannot change
-- return type of existing function"). El drop es seguro porque nada en la base
-- depende de esta función —la llama la app, no otra vista ni otra función— y
-- el `create` que sigue va en la MISMA transacción de la migración.
-- ============================================================================
drop function if exists public.ciclo_de_vida_negocios();

create function public.ciclo_de_vida_negocios()
returns table (
  negocio_id uuid,
  nombre text,
  estado text,
  creado timestamptz,
  plan_vencimiento timestamptz,
  plan_nombre text,
  plan_precio numeric,
  plan_link text,
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
    p.link_suscripcion::text as plan_link,
    d.usuario_id as duenio_id,
    d.email::text as duenio_email,
    (select count(*)::int from public.productos pr where pr.negocio_id = n.id) as productos,
    (select count(*)::int from public.ventas v where v.negocio_id = n.id) as ventas,
    (select max(v.fecha_venta) from public.ventas v where v.negocio_id = n.id) as ultima_venta,
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
  'Hechos del ciclo de vida de cada comercio (vencimiento, uso, dueño, link de pago del plan) para decidir qué mail le toca. SECURITY DEFINER: el where is_super_admin() es lo único que la protege. Ver 20260910130000 y 20260910140000.';

-- PUBLIC primero: toda función nueva nace con execute para PUBLIC, y anon lo
-- hereda — así que el revoke de la migración anterior se pierde con el drop y
-- hay que rehacerlo. El guard de abajo lo detecta.
revoke all on function public.ciclo_de_vida_negocios() from public, anon;
grant execute on function public.ciclo_de_vida_negocios() to authenticated;

do $$
declare
  v_cuerpo text := pg_get_functiondef('public.ciclo_de_vida_negocios()'::regprocedure);
begin
  if v_cuerpo not like '%is_super_admin%' then
    raise exception 'GUARD: ciclo_de_vida_negocios quedo sin el filtro de super admin';
  end if;

  if v_cuerpo not like '%link_suscripcion%' then
    raise exception 'GUARD: la funcion quedo sin el link del plan y los mails de cobro no se pueden armar';
  end if;

  if has_function_privilege('anon', 'public.ciclo_de_vida_negocios()', 'execute') then
    raise exception 'GUARD: anon puede ejecutar ciclo_de_vida_negocios';
  end if;
end $$;
