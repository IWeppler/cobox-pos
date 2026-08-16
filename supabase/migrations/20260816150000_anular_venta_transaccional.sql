-- La anulación también se escribe en una transacción, y arregla dos cosas que
-- movían plata mal.
--
-- (1) DEVOLVER LO QUE YA SE HABÍA PAGADO DE UN FIADO
--
-- La anulación restaba `venta.monto_pendiente`, que es la deuda del MOMENTO DE
-- LA VENTA. Los pagos de cuenta corriente bajan `clientes.saldo_pendiente` pero
-- nunca actualizan esa columna, así que el número que se restaba quedó viejo:
--
--   venta fiada por 23.700  ->  saldo 23.700
--   el cliente paga 10.000  ->  saldo 13.700   (monto_pendiente sigue en 23.700)
--   se anula                ->  max(0, 13.700 - 23.700) = 0
--
-- Se le perdonaban los 10.000 que ya había pagado. El movimiento de CREDITO
-- entraba por 23.700, que es más de lo que quedaba debiendo, así que el Libro
-- Mayor decía -10.000 y el saldo decía 0: dos respuestas distintas a la misma
-- pregunta. El `max(0, ...)` era justamente lo que tapaba la diferencia.
--
-- Ahora se acredita `least(deuda de la venta, saldo actual)`. Las dos puntas
-- terminan en el mismo número y el libro se puede seguir renglón por renglón.
--
-- Lo que ese cliente YA pagó de esta venta no se le devuelve solo, y es a
-- propósito: los pagos de cuenta corriente no están imputados a una venta —
-- son créditos contra el saldo del cliente— así que la base no puede saber
-- cuánto de ese pago era de ESTE ticket ni con qué medio se cobró. La función
-- lo devuelve como `excedente_ya_pagado` para que la app se lo diga a la
-- vendedora en vez de resolverlo con una suposición.
--
-- (2) NO SACAR EFECTIVO DEL CAJÓN POR UNA VENTA QUE SE COBRÓ CON TARJETA
--
-- El egreso se registraba por `monto_cobrado` entero, sin mirar el medio. Si la
-- clienta pagó con débito, esa plata nunca estuvo en el cajón: se devuelve por
-- el posnet. El turno cerraba con un faltante igual a la devolución, cada vez.
-- No es raro: de los 479 cobros de venta registrados, 207 (43%) no son efectivo.
--
-- Ahora el egreso sale solo por la porción en EFECTIVO, y lo que se cobró por
-- otros medios vuelve como `no_efectivo_a_devolver` para que la app avise que
-- eso se devuelve por donde entró.
--
-- Qué queda AFUERA: la restauración de stock y las unidades serializadas, por
-- el mismo criterio que en `registrar_venta`. Son acciones compensatorias que
-- ya tienen su propia atomicidad, y para cuando corren la venta ya está anulada
-- y la plata ya salió: hacerlas voltear la anulación dejaría a la vendedora
-- reintentando sobre una venta que ya no existe.
--
-- SECURITY INVOKER: el guard de permisos sigue siendo la RLS
-- (`ventas_update_propia_o_admin`). Si el UPDATE no afecta ninguna fila es
-- porque la policy lo negó, y ahí corta antes de tocar plata o stock.

create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo text,
  p_turno_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, security, pg_temp
as $$
declare
  v_negocio uuid := security.current_negocio_id();
  v_cliente uuid;
  v_pendiente numeric;
  v_efectivo numeric;
  v_otros numeric;
  v_saldo numeric;
  v_credito numeric := 0;
  v_excedente numeric := 0;
  v_ticket text := upper(split_part(p_venta_id::text, '-', 1));
begin
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  -- 1. El guard va PRIMERO y es un UPDATE condicional, no un SELECT: toma el
  -- row lock que serializa dos anulaciones simultáneas. La segunda no encuentra
  -- fila y sale por 'VENTA_YA_ANULADA' sin haber tocado nada.
  update public.ventas
     set estado_operacion = 'ANULADA',
         estado_pago = 'ANULADA',
         motivo_anulacion = p_motivo
   where id = p_venta_id
     and estado_operacion <> 'ANULADA'
  returning cliente_id, coalesce(monto_pendiente, 0)
       into v_cliente, v_pendiente;

  if not found then
    -- O ya estaba anulada, o la RLS negó el UPDATE (no es su venta y no tiene
    -- permiso de anular). La app distingue los dos casos antes de llamar.
    raise exception 'VENTA_NO_ANULABLE';
  end if;

  -- 2. Los cobros de esta venta quedan marcados como anulados.
  update public.venta_pagos
     set estado_pago_operacion = 'ANULADO'
   where venta_id = p_venta_id;

  -- 3. Cuánto de lo cobrado fue efectivo y cuánto no. Se mira el medio de cada
  -- cobro, no el total de la venta.
  select
    coalesce(sum(monto_bruto) filter (where metodo_tipo = 'EFECTIVO'), 0),
    coalesce(sum(monto_bruto) filter (where metodo_tipo <> 'EFECTIVO'), 0)
    into v_efectivo, v_otros
  from public.venta_pagos
  where venta_id = p_venta_id;

  -- 4. Solo el efectivo sale de la caja. `egresos.monto` es entero, así que se
  -- redondea al peso, igual que el resto del mostrador.
  if v_efectivo > 0 then
    insert into public.egresos (negocio_id, concepto, monto, creado_por, turno_caja_id)
    values (
      v_negocio,
      'Devolución en efectivo - Venta #' || v_ticket,
      round(v_efectivo)::int,
      auth.uid(),
      p_turno_id
    );
  end if;

  -- 5. Deuda de cuenta corriente.
  if v_cliente is not null and v_pendiente > 0 then
    -- FOR UPDATE: el saldo se lee y se escribe en la misma transacción, así que
    -- el lock es lo que impide que un pago del cliente entrando al mismo tiempo
    -- se pise contra una lectura vieja.
    select coalesce(saldo_pendiente, 0) into v_saldo
      from public.clientes
     where id = v_cliente
       for update;

    if found then
      v_credito := least(v_pendiente, greatest(v_saldo, 0));
      v_excedente := v_pendiente - v_credito;

      if v_credito > 0 then
        insert into public.cuenta_corriente_movimientos (
          negocio_id, cliente_id, venta_id, tipo, monto, descripcion, creado_por
        )
        values (
          v_negocio, v_cliente, p_venta_id, 'CREDITO', v_credito,
          'Anulación de Venta #' || v_ticket, auth.uid()
        );

        update public.clientes
           set saldo_pendiente = greatest(0, coalesce(saldo_pendiente, 0) - v_credito)
         where id = v_cliente;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'efectivo_devuelto', v_efectivo,
    'no_efectivo_a_devolver', v_otros,
    'credito_aplicado', v_credito,
    -- Lo que el cliente ya había pagado de esta venta por cuenta corriente.
    -- No se devuelve solo: la app lo avisa para que se resuelva a mano.
    'excedente_ya_pagado', v_excedente,
    'cliente_id', v_cliente
  );
end;
$$;

comment on function public.anular_venta(uuid, text, uuid) is
  'Anula una venta en UNA transacción: estado, cobros, egreso de caja (solo la '
  'porción en EFECTIVO) y crédito de cuenta corriente (acotado al saldo vivo, '
  'no a la deuda congelada de la venta). El stock y las unidades serializadas '
  'quedan afuera: son compensaciones y no pueden voltear la anulación.';

revoke all on function public.anular_venta(uuid, text, uuid) from public;
grant execute on function public.anular_venta(uuid, text, uuid) to authenticated;
