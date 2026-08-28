-- Backfill de los vencimientos que quedaron postergados por el bug que arregla
-- 20260828120000: cada venta fiada nueva pisaba `clientes.fecha_vencimiento_deuda`
-- con la fecha de ESE ticket, así que el campo dejó de representar la deuda más
-- vieja y pasó a representar la compra más reciente.
--
-- Cómo se reconstruye el valor correcto, y qué supone:
--
-- 1. IMPUTACIÓN FIFO. Los pagos de cuenta corriente no están imputados a una
--    venta (la base no sabe qué ticket saldó cada pago), así que se supone que
--    cancelan lo más viejo primero — el mismo supuesto que ya declara
--    `antiguedad_saldo_cc` y el que asume el propio cliente. Un débito sigue
--    vivo si el acumulado hasta él supera el total pagado; el más antiguo de
--    los vivos es el que fija el vencimiento.
-- 2. PISO POR MORA COBRADA. Si al cliente ya se le cobró mora (DEBITO con
--    `pago_id`, que hoy es exactamente eso), el vencimiento no puede quedar
--    antes de esa fecha + plazo: el recargo ya entró al capital, y volver a
--    vencerlo sería recargo sobre recargo. Mismo criterio que
--    el piso por mora de `recalcular_vencimiento_cc` (20260828130000).
-- 3. SOLO CORRIGE HACIA ATRÁS. Se tocan únicamente los clientes cuyo
--    vencimiento guardado es POSTERIOR al reconstruido — que es el efecto del
--    bug. Un vencimiento más urgente que el calculado puede venir de una
--    corrección manual y no se pisa.
--
-- El plazo sale de `configuracion_pos.cc_plazo_mora` del negocio de cada
-- cliente (30 si no hay config), no de una constante: los negocios tienen
-- plazos distintos.
--
-- OJO, esto mueve plata: varios clientes pasan a estar VENCIDOS hoy, así que en
-- su próximo pago se les va a cobrar el recargo por mora. Es lo correcto (la
-- deuda estaba efectivamente atrasada y el bug la escondía), pero es un cambio
-- visible en el mostrador.

with debitos as (
  select
    m.cliente_id,
    coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date) as fecha,
    m.monto,
    m.creado_en
  from public.cuenta_corriente_movimientos m
  where m.tipo = 'DEBITO'
    and m.anulado = false
),
creditos as (
  select cliente_id, sum(monto) as pagado
  from public.cuenta_corriente_movimientos
  where tipo = 'CREDITO'
    and anulado = false
  group by cliente_id
),
acumulado as (
  select
    d.cliente_id,
    d.fecha,
    sum(d.monto) over (
      partition by d.cliente_id
      order by d.fecha, d.creado_en
      rows unbounded preceding
    ) as acumulado
  from debitos d
),
vivos as (
  select a.cliente_id, min(a.fecha) as fecha_viva
  from acumulado a
  left join creditos c on c.cliente_id = a.cliente_id
  where a.acumulado > coalesce(c.pagado, 0)
  group by a.cliente_id
),
mora as (
  select cliente_id, max((creado_en at time zone 'UTC')::date) as ultima_mora
  from public.cuenta_corriente_movimientos
  where tipo = 'DEBITO'
    and anulado = false
    and pago_id is not null
  group by cliente_id
),
corregido as (
  select
    c.id,
    greatest(
      v.fecha_viva + coalesce(cp.cc_plazo_mora, 30),
      coalesce(mo.ultima_mora + coalesce(cp.cc_plazo_mora, 30), date '1900-01-01')
    ) as vencimiento
  from public.clientes c
  join vivos v on v.cliente_id = c.id
  left join public.configuracion_pos cp on cp.negocio_id = c.negocio_id
  left join mora mo on mo.cliente_id = c.id
  where c.saldo_pendiente > 0.05
    and c.fecha_vencimiento_deuda is not null
)
update public.clientes cl
   set fecha_vencimiento_deuda = co.vencimiento
  from corregido co
 where cl.id = co.id
   and cl.fecha_vencimiento_deuda > co.vencimiento;
