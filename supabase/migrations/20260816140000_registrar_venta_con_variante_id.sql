-- registrar_venta ahora graba tambien ventas_items.variante_id (columna nueva
-- en 20260816130000). Sin esto la columna nace vieja: quedaria poblada solo por
-- el backfill y en blanco para todo lo que se venda de aca en adelante, o sea
-- que la anulacion tendria que seguir cayendo al match por nombre justo en las
-- ventas mas recientes.
--
-- El resto del cuerpo es identico a 20260816120000.

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
security invoker
set search_path = public, security, pg_temp
as $$
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
begin
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  -- 1. Cabecera. El id viene armado desde Node porque las unidades
  -- serializadas ya se marcaron con él antes de llegar acá.
  insert into public.ventas (
    id, negocio_id, vendedor_id, cliente_id, turno_caja_id, estado_operacion,
    metodo_pago, total, precio_costo, cantidad, total_bruto,
    recargo_metodo_total, comision_total, total_neto, es_pago_mixto,
    monto_cobrado, monto_pendiente, estado_pago
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
    (p_venta->>'cantidad')::int,
    (p_venta->>'total_bruto')::numeric,
    (p_venta->>'recargo_metodo_total')::numeric,
    (p_venta->>'comision_total')::numeric,
    (p_venta->>'total_neto')::numeric,
    (p_venta->>'es_pago_mixto')::boolean,
    (p_venta->>'monto_cobrado')::numeric,
    (p_venta->>'monto_pendiente')::numeric,
    p_venta->>'estado_pago'
  )
  returning id, fecha_venta into v_venta_id, v_fecha_venta;

  -- 2. Desglose de pagos.
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

  -- 3. Renglones.
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
    -- Una venta sin renglones es una venta cobrada sin saber qué se vendió: no
    -- se puede calcular el margen ni devolver el stock al anular. Antes esto
    -- pasaba en silencio porque el insert no se chequeaba.
    raise exception 'VENTA_SIN_RENGLONES';
  end if;

  -- 4. Trazabilidad del descuento. El contador de usos va como delta: leerlo y
  -- escribirlo desde Node perdía usos cuando dos cajas usaban la promo a la vez.
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

  -- 5. Deuda de cuenta corriente.
  if p_cc is not null then
    v_cliente := nullif(p_cc->>'cliente_id', '')::uuid;
    v_pendiente := coalesce((p_cc->>'monto_pendiente')::numeric, 0);

    if v_cliente is not null and v_pendiente > 0.05 then
      -- Mismo cálculo que calcularFechaVencimiento en Node, y en UTC por el
      -- mismo motivo: fecha_vencimiento_deuda es `date` sin hora, y sumarle
      -- días en hora local corre el día según el huso del servidor.
      v_vencimiento := (v_fecha_venta at time zone 'UTC')::date
                       + coalesce((p_cc->>'plazo_mora')::int, 30);

      insert into public.cuenta_corriente_movimientos (
        negocio_id, cliente_id, venta_id, tipo, monto, descripcion, creado_por
      )
      values (
        v_negocio, v_cliente, v_venta_id, 'DEBITO', v_pendiente,
        p_cc->>'descripcion', v_vendedor
      );

      -- Delta, no lectura-y-escritura: un pago del cliente entrando al mismo
      -- tiempo que esta venta ya no se pisa contra un saldo viejo.
      update public.clientes
         set saldo_pendiente = coalesce(saldo_pendiente, 0) + v_pendiente,
             fecha_vencimiento_deuda = v_vencimiento
       where id = v_cliente;

      if not found then
        raise exception 'CLIENTE_NO_ENCONTRADO';
      end if;

      -- Vencimiento propio de ESTE ticket, aparte del campo agregado del
      -- cliente (que solo refleja el ticket más reciente).
      update public.ventas
         set fecha_vencimiento = v_vencimiento
       where id = v_venta_id;
    end if;
  end if;

  -- 6. Espejo legacy de productos_stock. Como delta: el valor que mandaba Node
  -- venía de una lectura hecha ~20 round-trips antes, así que dos cajas
  -- vendiendo el mismo producto escribían las dos sobre la misma lectura y el
  -- espejo se desincronizaba del stock canónico.
  update public.productos_stock ps
     set cantidad = ps.cantidad - s.cantidad
    from jsonb_to_recordset(p_stock_legacy) as s(stock_id uuid, cantidad numeric)
   where ps.id = s.stock_id;

  -- 7. Reservas que esta venta confirma.
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
$$;

comment on function public.registrar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[]) is
  'Escribe una venta completa (cabecera + pagos + renglones + descuento + deuda '
  'de cuenta corriente + espejo legacy de stock + reservas) en UNA transacción. '
  'El descuento de stock y las unidades serializadas quedan AFUERA a propósito: '
  'ya son atómicos y tienen su reversión en create-sale.ts.';

revoke all on function public.registrar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[]) from public;
grant execute on function public.registrar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[]) to authenticated;
