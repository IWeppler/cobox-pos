-- La tabla de comercios suma RUBRO y ACTIVIDAD de los últimos 7 días.
--
-- POR QUÉ: el panel mostraba si un comercio paga y cuánto consume de sus
-- límites, pero no si LO USA. Son cosas distintas y la segunda es la que
-- anticipa a la primera: un comercio que hace tres semanas que no vende es una
-- baja que todavía no pasó. Con la tabla anterior eso solo se veía entrando de
-- a uno.
--
-- Las ANULADAS no cuentan: una venta anulada no es actividad, es una
-- corrección. Contarlas mostraría movimiento donde no lo hubo.
--
-- Se devuelven las dos cosas —cantidad y monto— porque responden preguntas
-- distintas: 40 ventas de $500 y 2 de $10.000 no son el mismo comercio.
--
-- DROP + CREATE y no CREATE OR REPLACE: cambia el tipo de retorno, y Postgres
-- no deja reemplazar una función cuando cambian sus columnas de salida. Va en
-- una sola migración para que sea atómico.

drop function if exists public.comercios_con_uso();

create function public.comercios_con_uso()
returns table (
  id uuid, nombre text, slug text, estado text, duenio text,
  plan_id uuid, plan_nombre text, plan_precio numeric,
  plan_vencimiento timestamp with time zone,
  usuarios bigint, clientes_cc bigint, productos bigint,
  max_usuarios integer, max_clientes_cc integer, max_productos integer,
  rubro text, ventas_7d bigint, monto_7d numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    (select count(*) from public.clientes c
      where c.negocio_id = n.id and c.saldo_pendiente > 0),
    (select count(*) from public.productos pr where pr.negocio_id = n.id),
    nullif(public.reglas_negocio(n.id) ->> 'max_usuarios', 'null')::int,
    nullif(public.reglas_negocio(n.id) ->> 'max_clientes_cuenta_corriente', 'null')::int,
    nullif(public.reglas_negocio(n.id) ->> 'max_productos', 'null')::int,
    (select c.rubro from public.configuracion_pos c where c.negocio_id = n.id limit 1) as rubro,
    (select count(*) from public.ventas v
      where v.negocio_id = n.id
        and v.estado_operacion <> 'ANULADA'
        and v.fecha_venta >= now() - interval '7 days') as ventas_7d,
    (select coalesce(sum(v.total), 0) from public.ventas v
      where v.negocio_id = n.id
        and v.estado_operacion <> 'ANULADA'
        and v.fecha_venta >= now() - interval '7 days') as monto_7d
  from public.negocios n
  left join public.planes pl on pl.id = n.plan_id
  -- SECURITY DEFINER: sin este filtro la funcion mostraria TODOS los negocios
  -- a cualquiera que la llame. El corte es explicito y es lo unico que la
  -- protege, porque definer se saltea RLS.
  where security.is_super_admin()
  order by n.created_at;
$function$;

grant execute on function public.comercios_con_uso() to authenticated;
