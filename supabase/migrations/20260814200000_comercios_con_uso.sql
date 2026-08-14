-- Los comercios con su consumo real de cada límite, para el panel de Comerz.
--
-- Por qué una RPC y no N consultas desde Node: con un comercio de 1116
-- productos, contar del lado de la app significa traerse el catálogo entero de
-- cada negocio para descartarlo. Acá se cuenta donde están los datos y viajan
-- números.
--
-- Los topes salen de `reglas_negocio()` —plan MÁS `reglas_override`— y no de
-- `planes.reglas`: un negocio puede tener condiciones acordadas aparte, y
-- mostrar el tope del plan le diría "50" a alguien que tiene 75.

create or replace function public.comercios_con_uso()
returns table (
  id uuid,
  nombre text,
  slug text,
  estado text,
  duenio text,
  plan_id uuid,
  plan_nombre text,
  plan_precio numeric,
  plan_vencimiento timestamptz,
  usuarios bigint,
  clientes_cc bigint,
  productos bigint,
  max_usuarios int,
  max_clientes_cc int,
  max_productos int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.nombre,
    n.slug,
    n.estado,
    (
      select p.email from public.usuarios_negocios un
      join public.perfiles p on p.id = un.usuario_id
      where un.negocio_id = n.id and un.es_owner
      limit 1
    ) as duenio,
    n.plan_id,
    pl.nombre as plan_nombre,
    coalesce(pl.precio_mensual, 0) as plan_precio,
    n.plan_vencimiento,
    (select count(*) from public.usuarios_negocios u where u.negocio_id = n.id),
    -- Clientes CON DEUDA ABIERTA, que es lo que cuenta el tope del plan: no
    -- son los clientes cargados. Misma cuenta que validar_limite_cc_manual.
    (select count(*) from public.clientes c
      where c.negocio_id = n.id and c.saldo_pendiente > 0),
    (select count(*) from public.productos pr where pr.negocio_id = n.id),
    nullif(public.reglas_negocio(n.id) ->> 'max_usuarios', 'null')::int,
    nullif(public.reglas_negocio(n.id) ->> 'max_clientes_cuenta_corriente', 'null')::int,
    nullif(public.reglas_negocio(n.id) ->> 'max_productos', 'null')::int
  from public.negocios n
  left join public.planes pl on pl.id = n.plan_id
  -- SECURITY DEFINER se saltea RLS, así que este filtro es lo ÚNICO que
  -- impide que cualquier usuario liste todos los comercios de la plataforma.
  -- No es una optimización: es el control de acceso de la función.
  where security.is_super_admin()
  order by n.created_at;
$$;

comment on function public.comercios_con_uso is
  'Panel de Comerz: comercios con su consumo real de cada límite. Los topes salen de reglas_negocio() (plan + override), no de planes.reglas. Solo super admin.';

revoke all on function public.comercios_con_uso() from public, anon;
grant execute on function public.comercios_con_uso() to authenticated;
