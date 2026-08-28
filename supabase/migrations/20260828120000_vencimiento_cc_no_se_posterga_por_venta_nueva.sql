-- Una venta fiada nueva NO puede correr el vencimiento de la deuda vieja.
--
-- `registrar_venta` asignaba `clientes.fecha_vencimiento_deuda = v_vencimiento`
-- directo, sin comparar: el campo terminaba reflejando SIEMPRE el último ticket
-- fiado. Consecuencia real: una clienta con deuda del 22/07 (vencía el 22/08)
-- volvió a comprar fiado el 23/08 y el vencimiento saltó al 22/09 — nunca
-- figuró vencida y nunca se le cobró la mora. Comprar de nuevo perdonaba el
-- atraso, que es exactamente al revés de lo que tiene que pasar.
--
-- El criterio correcto ya existía en `registrarDeudaAction`
-- (features/clients/actions/manage-clients.ts): el vencimiento nunca se hace
-- MENOS urgente. Acá se aplica el mismo, con `least`.
--
-- El piso por mora cobrada (hoy en recalcular_vencimiento_cc) no hace falta
-- consultarlo: cuando se cobra una mora el cobro ya deja el campo en
-- "hoy + plazo", y `least(existente, nuevo)` nunca lo adelanta más que eso.
--
-- Sigue habiendo asignación directa cuando el cliente NO tenía saldo (o el
-- campo estaba en null): ahí el ticket nuevo es la única deuda viva y su
-- vencimiento es el que corresponde.
--
-- `ventas.fecha_vencimiento` no cambia: es el vencimiento propio de ESE
-- ticket, y ese sí sale siempre de su fecha de venta.

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

      -- Delta, no lectura-y-escritura, y el vencimiento nunca se posterga: si
      -- el cliente ya venía debiendo, manda el más urgente de los dos. Las
      -- referencias de la derecha son los valores VIEJOS de la fila, que es
      -- justo lo que hace falta para comparar contra el saldo previo.
      update public.clientes
         set saldo_pendiente = coalesce(saldo_pendiente, 0) + v_pendiente,
             fecha_vencimiento_deuda = case
               when coalesce(saldo_pendiente, 0) > 0.05
                    and fecha_vencimiento_deuda is not null
                 then least(fecha_vencimiento_deuda, v_vencimiento)
               else v_vencimiento
             end
       where id = v_cliente;

      if not found then
        raise exception 'CLIENTE_NO_ENCONTRADO';
      end if;

      -- Vencimiento propio de ESTE ticket, aparte del campo agregado del
      -- cliente (que ahora refleja la deuda viva más antigua, no el último
      -- ticket).
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

comment on column public.clientes.fecha_vencimiento_deuda is
  'Vencimiento de la deuda VIVA más antigua del cliente, no la del último '
  'ticket fiado. Nunca se posterga por una compra nueva: cuando ya hay saldo, '
  'registrar_venta toma least(existente, vencimiento del ticket). Sube solo '
  'cuando se cobra la mora (el recargo entra al capital y el reloj arranca de '
  'nuevo, ver resolverVencimientoConPisoDeMora) o cuando la deuda se salda.';
