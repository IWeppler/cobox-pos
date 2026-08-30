-- Cuánto de lo que debe un cliente está REALMENTE vencido.
--
-- El recargo por mora se venía calculando sobre `clientes.saldo_pendiente`
-- entero: alcanzaba con que el ticket más viejo se atrasara un día para que
-- todo lo comprado después quedara alcanzado por el 15%. Medido en Evens el
-- 30/8/2026: una clienta con $175 vencidos (el resto de un ticket del 21/7) y
-- $104.825 de saldo iba a pagar $15.723,75 de mora, de los cuales $11.040
-- correspondían a una compra hecha el día anterior que vence el 3/10.
--
-- Sobre lo ya cobrado, 20 débitos de mora por $127.759,75 en dos negocios:
-- 11 correctos al peso, 3 cobrados de más y 6 cobrados con NADA vencido.
-- $45.525 de más en total (35,6%). Evens ya había perdonado uno a mano.
--
-- De dónde salió: la mora antes recorría `ventas`, donde cada ticket traía su
-- propia fecha. Se cambió a leer el saldo cacheado del cliente por un buen
-- motivo —así también devengan la deuda importada por CSV y los ajustes
-- manuales, que en Evens eran 17 de 18 clientes vencidos— pero al pasar de
-- "por ticket" a "por cliente" quedó UN número y UNA fecha, y ahí se perdió la
-- distinción entre lo vencido y lo que todavía no.
--
-- Esta función devuelve las dos cosas por separado, con la MISMA imputación
-- FIFO que `recalcular_vencimiento_cc` (20260828130000). No se reimplementa el
-- criterio: es el mismo recorrido del libro, y la fecha que devuelve tiene que
-- coincidir con la que esa función escribe en `clientes.fecha_vencimiento_deuda`.
--
-- FIFO es un SUPUESTO, no un dato —los pagos de cuenta corriente no están
-- imputados a una venta— y está declarado como tal en las dos funciones y en
-- `antiguedad_saldo_cc`. El día que exista imputación explícita, son tres
-- lugares y ninguno adivina.
--
-- `p_cliente_id` null devuelve TODOS los clientes con deuda viva del negocio
-- activo: el listado de clientes y el modal de cobro necesitan la columna para
-- una lista entera, y pedirla cliente por cliente serían 156 viajes a Ohio.
-- El aislamiento lo da la RLS de `clientes` y `cuenta_corriente_movimientos`,
-- no un filtro de este SQL — SECURITY INVOKER, mismo criterio que
-- `recalcular_vencimiento_cc` y `registrar_venta`.

create or replace function public.deuda_cc_vencida(p_cliente_id uuid default null)
returns table (
  cliente_id uuid,
  saldo_vivo numeric,
  vencido numeric,
  fecha_mas_antigua date
)
language sql
stable
security invoker
set search_path to 'public', 'security', 'pg_temp'
as $$
  with plazos as (
    select c.id as cliente_id, coalesce(cp.cc_plazo_mora, 30) as dias
    from public.clientes c
    left join public.configuracion_pos cp on cp.negocio_id = c.negocio_id
    where p_cliente_id is null or c.id = p_cliente_id
  ),
  debitos as (
    select
      m.cliente_id,
      coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date) as fecha,
      m.monto,
      m.creado_en,
      sum(m.monto) over (
        partition by m.cliente_id
        order by coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date), m.creado_en
        rows unbounded preceding
      ) as acumulado
    from public.cuenta_corriente_movimientos m
    join plazos p on p.cliente_id = m.cliente_id
    where m.tipo = 'DEBITO'
      and m.anulado = false
  ),
  pagado as (
    select m.cliente_id, coalesce(sum(m.monto), 0) as total
    from public.cuenta_corriente_movimientos m
    join plazos p on p.cliente_id = m.cliente_id
    where m.tipo = 'CREDITO'
      and m.anulado = false
    group by m.cliente_id
  ),
  -- Lo que queda vivo de CADA débito después de imputar los pagos a los más
  -- viejos. `acumulado - pagado` es cuánto de este débito quedó sin cubrir;
  -- acotado entre 0 y su propio monto, un débito puede quedar entero, parcial
  -- o cancelado, que es exactamente lo que hace falta para partir el saldo.
  vivos as (
    select
      d.cliente_id,
      d.fecha,
      greatest(
        0,
        least(d.monto, d.acumulado - coalesce(pg.total, 0))
      ) as vivo,
      pl.dias
    from debitos d
    join plazos pl on pl.cliente_id = d.cliente_id
    left join pagado pg on pg.cliente_id = d.cliente_id
  )
  select
    v.cliente_id,
    round(sum(v.vivo), 2) as saldo_vivo,
    round(sum(v.vivo) filter (
      where v.vivo > 0 and v.fecha + v.dias < current_date
    ), 2) as vencido,
    min(v.fecha) filter (where v.vivo > 0) as fecha_mas_antigua
  from vivos v
  group by v.cliente_id
  having sum(v.vivo) > 0;
$$;

comment on function public.deuda_cc_vencida(uuid) is
  'Parte la deuda viva de un cliente (o de todos los del negocio, con null) en '
  'saldo total y porción VENCIDA, con imputación FIFO de los pagos. Es la base '
  'del recargo por mora: cobrarlo sobre el saldo entero le carga interés a '
  'compras que todavía no vencieron. Comparte criterio con '
  'recalcular_vencimiento_cc — la fecha que devuelve es la que esa función usa '
  'para escribir clientes.fecha_vencimiento_deuda.';

grant execute on function public.deuda_cc_vencida(uuid) to authenticated;
