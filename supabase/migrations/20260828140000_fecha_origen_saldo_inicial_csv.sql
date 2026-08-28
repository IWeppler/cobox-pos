-- El import de clientes por CSV escribía la deuda en el libro SIN `fecha_origen`.
--
-- `importarClientesCSVAction` guardaba dos cosas de cada fila: el saldo inicial
-- como DEBITO ("Saldo inicial importado (CSV)") y la fecha de vencimiento que
-- traía la planilla en `clientes.fecha_vencimiento_deuda`. Pero el DEBITO iba
-- sin `fecha_origen`, así que para el libro esa deuda nació el día del import
-- (18/07/2026) — y la única constancia de cuándo se generó de verdad era la
-- columna del cliente.
--
-- Mientras cada camino calculaba el vencimiento a su manera eso no se notaba.
-- Con `recalcular_vencimiento_cc` (20260828130000) como regla única, el libro
-- es la fuente: MIRTA GARCIA, que venía atrasada desde el 14/03, pasaría a
-- vencer el 22/08 (18/07 + 35) y se le perdonarían cinco meses de mora.
--
-- La corrección es al revés de lo que parece: no se toca el vencimiento, se
-- REPONE en el libro el dato que faltaba. `fecha_origen` = vencimiento
-- guardado − plazo del negocio, que es exactamente la cuenta que hizo quien
-- cargó la planilla, al revés.
--
-- Solo entran las filas donde la fecha reconstruida es ANTERIOR al día del
-- import: es lo que distingue una deuda vieja de verdad de la diferencia de
-- 5 días que tienen ~50 clientes de Evens por otro motivo (sus ventas se
-- registraron con `cc_plazo_mora` en 30 y hoy la config dice 35). Esas quedan
-- afuera a propósito.
--
-- Después de esto el libro y la columna dicen lo mismo, y la regla única
-- devuelve el vencimiento que ya estaba guardado.

with plazos as (
  select negocio_id, coalesce(cc_plazo_mora, 30) as dias
  from public.configuracion_pos
),
objetivo as (
  select
    m.id as movimiento_id,
    (c.fecha_vencimiento_deuda - coalesce(p.dias, 30)) as fecha_real
  from public.cuenta_corriente_movimientos m
  join public.clientes c on c.id = m.cliente_id
  left join plazos p on p.negocio_id = c.negocio_id
  where m.anulado = false
    and m.venta_id is null
    and m.pago_id is null
    and m.tipo = 'DEBITO'
    and m.fecha_origen is null
    and m.descripcion = 'Saldo inicial importado (CSV)'
    and c.saldo_pendiente > 0.05
    and c.fecha_vencimiento_deuda is not null
    and (c.fecha_vencimiento_deuda - coalesce(p.dias, 30))
        < (m.creado_en at time zone 'UTC')::date
)
update public.cuenta_corriente_movimientos m
   set fecha_origen = o.fecha_real
  from objetivo o
 where m.id = o.movimiento_id;
