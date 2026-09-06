-- ---------------------------------------------------------------------------
-- La mora deja de limpiarse con un pago parcial.
--
-- EL RECLAMO, con nombre y apellido. Vero duarte (Estilo Bonito) debía $62.000,
-- se le cobró $1.500 de mora y pagó $32.000. Después del pago el sistema la
-- mostró AL DÍA hasta el 06/10. La dueña reclamó, y tiene razón: pagar una
-- parte no puede borrar una mora que ya existía.
--
-- POR QUÉ PASABA. `recalcular_vencimiento_cc` hacía
-- `greatest(deuda_viva_más_vieja + plazo, última_mora + plazo)`. La segunda
-- mitad de ese greatest está documentada como "piso por mora cobrada" y su
-- intención era buena —no cobrar recargo sobre recargo— pero el efecto es que
-- LA PROPIA FILA DE MORA corre el vencimiento 31 días hacia adelante. Cobrarle
-- el recargo le regalaba un mes.
--
-- Y encima el FIFO hacía el resto: al imputar el pago contra lo más viejo, lo
-- que quedaba vivo era una compra más nueva, con fecha de vencimiento más
-- lejana. Las dos cosas juntas dejaban a una clienta atrasada figurando al día.
--
-- MEDIDO ANTES DE TOCAR: 12 clientas de tres comercios pasan de "al día" a
-- vencidas, $467.072 de deuda. La peor es MIRTA GARCIA (Evens): su deuda viva
-- arranca en un débito de febrero y el sistema la venía mostrando al día hasta
-- octubre — 175 días de mora escondida.
--
-- LA REGLA NUEVA, tal como la definió la dueña: la mora es del CICLO DE DEUDA,
-- no del renglón. Una vez que la cuenta entró en mora sigue en mora hasta que
-- se salde por completo; recién ahí el ciclo se reinicia.
--
-- Se traduce en un ancla: el vencimiento lo fija el débito más viejo POSTERIOR
-- a la última vez que el saldo llegó a cero. Un pago parcial no lo mueve
-- —porque el saldo no llegó a cero— y una compra nueva tampoco, que es lo que
-- ya pedía `20260828120000`. Cuando salda todo, el próximo fiado abre ciclo
-- nuevo y la fecha vuelve a correr desde ahí.
--
-- SE CAE EL PISO POR MORA. Ya no hace falta para evitar recargo sobre recargo:
-- `calcularSaldoConRecargo` calcula el recargo sobre `saldo_pendiente`, que es
-- capital, y por eso da lo mismo cuántas veces se recalcule. La pantalla de
-- Configuración > Clientes lo promete: "se suma una única vez ... no se acumula
-- día a día".
--
-- NO SE ESCRIBE NINGUNA MORA RETROACTIVA, y es a propósito. La mora se
-- materializa cuando la clienta paga (`registrarPagoDeudaAction` inserta el
-- DEBITO justo antes del cobro), así que a las 12 les va a entrar sola en su
-- próximo pago, por el camino de siempre. Insertar 12 débitos a mano sería
-- escribir plata en el libro sin que nadie haya cobrado nada.
--
-- CUERPO TOMADO DE `pg_get_functiondef` (md5 2c1d8f96a80efd0ef92b139f43891b4e,
-- 1.612 caracteres). Lo único que cambia es el cálculo del ancla y la caída del
-- bloque `mora`.
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_vencimiento_cc(p_cliente_id uuid)
returns date
language sql
stable
security invoker
set search_path to 'public', 'security', 'pg_temp'
as $$
  with plazo as (
    select coalesce(cp.cc_plazo_mora, 30) as dias
    from public.clientes c
    left join public.configuracion_pos cp on cp.negocio_id = c.negocio_id
    where c.id = p_cliente_id
  ),
  -- El libro completo, en orden, con el saldo que quedaba después de cada
  -- movimiento. Es lo que permite encontrar dónde la cuenta se saldó.
  movimientos as (
    select
      coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date) as fecha,
      m.creado_en,
      m.tipo,
      sum(case when m.tipo = 'DEBITO' then m.monto else -m.monto end) over (
        order by coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date),
                 m.creado_en
        rows unbounded preceding
      ) as saldo_tras
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = p_cliente_id
      and m.anulado = false
  ),
  -- La última vez que la cuenta quedó en cero (o menos, si hubo saldo a favor).
  -- Todo lo anterior a ese momento está saldado y no puede fijar vencimiento.
  ultimo_cero as (
    select max(mo.creado_en) as creado_en
    from movimientos mo
    where mo.saldo_tras <= 0
  ),
  -- El ancla: el débito más viejo del ciclo vigente.
  ancla as (
    select min(mo.fecha) as fecha
    from movimientos mo, ultimo_cero uc
    where mo.tipo = 'DEBITO'
      and (uc.creado_en is null or mo.creado_en > uc.creado_en)
  )
  select case
           when a.fecha is null then null
           else a.fecha + pl.dias
         end
  from ancla a, plazo pl;
$$;

comment on function public.recalcular_vencimiento_cc(uuid) is
  'Vencimiento del ciclo de deuda: débito más viejo posterior al último saldo cero, + cc_plazo_mora. Un pago parcial NO lo mueve — la mora se limpia solo saldando todo. Ver 20260905190000.';

-- ---------------------------------------------------------------------------
-- Refrescar el campo cacheado de todos los clientes con deuda, que es lo que
-- leen la ficha, la tabla y el Advisor. Sin esto el criterio nuevo solo se
-- aplicaría al próximo movimiento de cada cliente.
-- ---------------------------------------------------------------------------
update public.clientes c
   set fecha_vencimiento_deuda = public.recalcular_vencimiento_cc(c.id)
 where c.saldo_pendiente > 0;

-- ---------------------------------------------------------------------------
-- Guard: la función no puede volver a mirar las filas de mora para correr la
-- fecha, y tiene que anclar al último saldo cero.
-- ---------------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'recalcular_vencimiento_cc';

  if v_def ~* 'pago_id is not null' then
    raise exception 'recalcular_vencimiento_cc volvió a usar el piso por mora.';
  end if;

  if v_def !~* 'ultimo_cero' then
    raise exception 'recalcular_vencimiento_cc no ancla al último saldo cero.';
  end if;
end $$;
