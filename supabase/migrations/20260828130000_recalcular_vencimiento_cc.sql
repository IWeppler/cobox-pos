-- UNA sola regla para `clientes.fecha_vencimiento_deuda`, en la base.
--
-- Había tres implementaciones de la misma pregunta ("¿cuándo vence lo que este
-- cliente debe?") y cada una miraba un pedazo distinto de la historia:
--
--   * `registrar_venta` tomaba la fecha del ticket nuevo (arreglado en
--     20260828120000, que dejó de postergar pero seguía siendo su propia regla).
--   * `recalcularVencimientoDesdeMovimientosManuales` (TS) miraba SOLO los
--     movimientos manuales: ignoraba los pagos y las ventas fiadas. Anular un
--     ajuste manual devolvía el vencimiento a un débito que ya estaba pagado.
--   * `registrarPagoDeudaAction` y `ajustarSaldoAction` tenían cada una su
--     propio criterio parcial.
--
-- Tres reglas para un campo divergen siempre, y ya divergieron dos veces el
-- mismo día. Esta función es la regla, y los cuatro caminos la llaman.
--
-- Qué calcula, y qué supone:
--
-- 1. IMPUTACIÓN FIFO. Los pagos de cuenta corriente no están imputados a una
--    venta, así que se supone que cancelan lo más viejo primero — mismo
--    supuesto que declara `antiguedad_saldo_cc`. Un débito sigue vivo si el
--    acumulado hasta él supera el total pagado; el más antiguo de los vivos
--    fija el vencimiento. Es un SUPUESTO, no un dato: el día que exista
--    imputación explícita de pagos, esta función es el único lugar a cambiar.
-- 2. PISO POR MORA COBRADA. Si ya se le cobró mora al cliente (DEBITO con
--    `pago_id`, que hoy es exactamente eso), el vencimiento no puede quedar
--    antes de esa fecha + plazo: el recargo ya entró al capital y volver a
--    vencerlo sería cobrar recargo sobre recargo.
-- 3. SIN DEUDA VIVA, NULL. Si los pagos cubren todo el libro no hay nada que
--    pueda vencer.
--
-- El plazo sale de `configuracion_pos.cc_plazo_mora` del negocio del cliente
-- (30 si no hay config): los negocios tienen plazos distintos y el llamador no
-- tiene por qué saberlo.
--
-- SECURITY INVOKER: el aislamiento entre negocios lo tiene que seguir dando la
-- RLS del que llama, mismo criterio que `registrar_venta`.

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
  debitos as (
    select
      coalesce(m.fecha_origen, (m.creado_en at time zone 'UTC')::date) as fecha,
      m.monto,
      m.creado_en
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = p_cliente_id
      and m.tipo = 'DEBITO'
      and m.anulado = false
  ),
  pagado as (
    select coalesce(sum(m.monto), 0) as total
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = p_cliente_id
      and m.tipo = 'CREDITO'
      and m.anulado = false
  ),
  acumulado as (
    select
      d.fecha,
      sum(d.monto) over (order by d.fecha, d.creado_en rows unbounded preceding) as acumulado
    from debitos d
  ),
  vivo as (
    select min(a.fecha) as fecha
    from acumulado a, pagado p
    where a.acumulado > p.total
  ),
  mora as (
    select max((m.creado_en at time zone 'UTC')::date) as fecha
    from public.cuenta_corriente_movimientos m
    where m.cliente_id = p_cliente_id
      and m.tipo = 'DEBITO'
      and m.anulado = false
      and m.pago_id is not null
  )
  select case
           when v.fecha is null then null
           else greatest(v.fecha + pl.dias, coalesce(mo.fecha + pl.dias, v.fecha + pl.dias))
         end
  from vivo v, mora mo, plazo pl;
$$;

comment on function public.recalcular_vencimiento_cc(uuid) is
  'Vencimiento de la deuda viva más antigua del cliente, con imputación FIFO de '
  'los pagos y piso por mora ya cobrada. Es la ÚNICA regla para '
  'clientes.fecha_vencimiento_deuda: la llaman registrar_venta y las actions de '
  'cobro, ajuste de saldo, perdón y edición/anulación de movimientos.';

grant execute on function public.recalcular_vencimiento_cc(uuid) to authenticated;

-- registrar_venta pasa a usarla en vez de su propio least(). El `coalesce` con
-- el vencimiento del ticket es el fail-safe: si el libro de ese cliente está
-- descuadrado y FIFO no encuentra deuda viva (lo que `clientes_descuadrados`
-- ya cuenta como 2 de 156), una venta fiada no puede quedar SIN vencimiento.
create or replace function public.registrar_venta(
  p_venta jsonb,
  p_pagos jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_stock_legacy jsonb default '[]'::jsonb,
  p_descuento jsonb default null,
  p_cc jsonb default null,
  p_reserva_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
set search_path to 'public', 'security', 'pg_temp'
as $function$
declare
  v_negocio uuid := security.current_negocio_id();
  v_venta_id uuid;
  v_fecha_venta timestamptz;
  v_vencimiento date;
  v_turno uuid := nullif(p_venta->>'turno_caja_id', '')::uuid;
  v_vendedor uuid := (p_venta->>'vendedor_id')::uuid;
  v_cliente uuid;
  v_pendiente numeric;
  v_promocion uuid;
  v_recargo_cc numeric;
begin
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  insert into public.ventas (
    id, negocio_id, vendedor_id, cliente_id, turno_caja_id, estado_operacion,
    metodo_pago, total, precio_costo, cantidad, total_bruto,
    recargo_metodo_total, comision_total, total_neto, es_pago_mixto,
    monto_cobrado, monto_pendiente, estado_pago,
    recargo_cc_porcentaje, recargo_cc_monto
  )
  values (
    (p_venta->>'id')::uuid,
    v_negocio,
    v_vendedor,
    nullif(p_venta->>'cliente_id', '')::uuid,
    v_turno,
    p_venta->>'estado_operacion',
    p_venta->>'metodo_pago',
    (p_venta->>'total')::numeric,
    (p_venta->>'precio_costo')::numeric,
    (p_venta->>'cantidad')::numeric,
    (p_venta->>'total_bruto')::numeric,
    (p_venta->>'recargo_metodo_total')::numeric,
    (p_venta->>'comision_total')::numeric,
    (p_venta->>'total_neto')::numeric,
    (p_venta->>'es_pago_mixto')::boolean,
    (p_venta->>'monto_cobrado')::numeric,
    (p_venta->>'monto_pendiente')::numeric,
    p_venta->>'estado_pago',
    (p_venta->>'recargo_cc_porcentaje')::numeric,
    (p_venta->>'recargo_cc_monto')::numeric
  )
  returning id, fecha_venta into v_venta_id, v_fecha_venta;

  insert into public.venta_pagos (
    negocio_id, venta_id, metodo_pago_id, metodo_nombre, metodo_tipo,
    monto_base, recargo_porcentaje, recargo_monto, monto_bruto,
    comision_porcentaje, comision_monto, monto_neto, acreditacion_dias,
    turno_caja_id
  )
  select
    v_negocio, v_venta_id, p.metodo_pago_id, p.metodo_nombre, p.metodo_tipo,
    p.monto_base, p.recargo_porcentaje, p.recargo_monto, p.monto_bruto,
    p.comision_porcentaje, p.comision_monto, p.monto_neto,
    p.acreditacion_dias, v_turno
  from jsonb_to_recordset(p_pagos) as p(
    metodo_pago_id uuid, metodo_nombre text, metodo_tipo text,
    monto_base numeric, recargo_porcentaje numeric, recargo_monto numeric,
    monto_bruto numeric, comision_porcentaje numeric, comision_monto numeric,
    monto_neto numeric, acreditacion_dias int
  );

  insert into public.ventas_items (
    negocio_id, venta_id, producto_id, variante, variante_id, unidad_serie_id, cantidad,
    precio_unitario, precio_costo, descuento_monto, precio_final,
    promocion_id, promocion_nombre
  )
  select
    v_negocio, v_venta_id, i.producto_id, i.variante, i.variante_id, i.unidad_serie_id,
    i.cantidad, i.precio_unitario, i.precio_costo, i.descuento_monto,
    i.precio_final, i.promocion_id, i.promocion_nombre
  from jsonb_to_recordset(p_items) as i(
    producto_id uuid, variante text, variante_id uuid, unidad_serie_id uuid, cantidad numeric,
    precio_unitario numeric, precio_costo numeric, descuento_monto numeric,
    precio_final numeric, promocion_id uuid, promocion_nombre text
  );

  if not exists (select 1 from public.ventas_items where venta_id = v_venta_id) then
    raise exception 'VENTA_SIN_RENGLONES';
  end if;

  if p_descuento is not null then
    v_promocion := (p_descuento->>'promocion_id')::uuid;

    insert into public.ventas_descuentos (
      negocio_id, venta_id, promocion_id, promocion_nombre, tipo_descuento,
      monto_descontado
    )
    values (
      v_negocio, v_venta_id, v_promocion,
      p_descuento->>'promocion_nombre',
      p_descuento->>'tipo_descuento',
      (p_descuento->>'monto_descontado')::numeric
    );

    update public.promociones
       set usos_actuales = coalesce(usos_actuales, 0) + 1
     where id = v_promocion;
  end if;

  if p_cc is not null then
    v_cliente := nullif(p_cc->>'cliente_id', '')::uuid;
    v_pendiente := coalesce((p_cc->>'monto_pendiente')::numeric, 0);

    if v_cliente is not null and v_pendiente > 0.05 then
      v_vencimiento := (v_fecha_venta at time zone 'UTC')::date
                       + coalesce((p_cc->>'plazo_mora')::int, 30);

      v_recargo_cc := least(
        coalesce((p_venta->>'recargo_cc_monto')::numeric, 0),
        v_pendiente
      );

      -- El débito entra ANTES de recalcular: recalcular_vencimiento_cc lee el
      -- libro, y dentro de esta transacción el renglón nuevo ya está.
      insert into public.cuenta_corriente_movimientos (
        negocio_id, cliente_id, venta_id, tipo, monto, descripcion, creado_por,
        monto_recargo, recargo_porcentaje
      )
      values (
        v_negocio, v_cliente, v_venta_id, 'DEBITO', v_pendiente,
        p_cc->>'descripcion', v_vendedor,
        v_recargo_cc,
        (p_venta->>'recargo_cc_porcentaje')::numeric
      );

      -- Delta sobre el saldo, no lectura-y-escritura: un pago del cliente
      -- entrando al mismo tiempo que esta venta ya no se pisa contra un saldo
      -- viejo. El vencimiento sale de la regla única, no de este ticket.
      update public.clientes
         set saldo_pendiente = coalesce(saldo_pendiente, 0) + v_pendiente,
             fecha_vencimiento_deuda = coalesce(
               public.recalcular_vencimiento_cc(v_cliente),
               v_vencimiento
             )
       where id = v_cliente;

      if not found then
        raise exception 'CLIENTE_NO_ENCONTRADO';
      end if;

      -- Vencimiento propio de ESTE ticket, aparte del campo agregado del
      -- cliente (que refleja la deuda viva más antigua, no el último ticket).
      update public.ventas
         set fecha_vencimiento = v_vencimiento
       where id = v_venta_id;
    end if;
  end if;

  update public.productos_stock ps
     set cantidad = ps.cantidad - s.cantidad
    from jsonb_to_recordset(p_stock_legacy) as s(stock_id uuid, cantidad numeric)
   where ps.id = s.stock_id;

  if array_length(p_reserva_ids, 1) > 0 then
    update public.reservas
       set estado = 'CONFIRMADA',
           venta_id = v_venta_id,
           resuelto_en = now()
     where id = any(p_reserva_ids)
       and estado = 'ACTIVA';
  end if;

  return jsonb_build_object(
    'venta_id', v_venta_id,
    'fecha_venta', v_fecha_venta,
    'fecha_vencimiento', v_vencimiento
  );
end;
$function$;
