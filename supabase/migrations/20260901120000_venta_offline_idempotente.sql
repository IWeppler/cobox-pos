-- ---------------------------------------------------------------------------
-- Ventas offline: idempotencia por id, fecha real y marca de origen.
--
-- PARA QUÉ. El wifi del local se cae seguido, así que el POS va a poder cobrar
-- sin señal y sincronizar después. Eso obliga a tres cosas que hoy la base no
-- puede hacer:
--
-- 1. IDEMPOTENCIA. Una venta guardada en el celular se reenvía hasta que el
--    server confirma. Si la confirmación se pierde en el camino —la venta se
--    grabó pero la respuesta no volvió— el reintento NO puede crear una
--    segunda venta con sus pagos y su descuento de stock. Con el `id` puesto
--    por el cliente, la PK es la clave de idempotencia: `on conflict do
--    nothing` y, si no insertó, se devuelve `ya_registrada` como resultado
--    normal y no como excepción. Mismo patrón que `aprobar_orden_compra`.
--
--    Ojo con lo que esto implica para quien llama: cuando vuelve
--    `ya_registrada`, el stock que ESTE intento descontó hay que devolverlo
--    (el intento anterior ya lo había descontado). De eso se ocupa
--    create-sale.ts.
--
-- 2. FECHA REAL. `fecha_venta` tenía default `now()`, o sea la hora de la
--    SINCRONIZACIÓN. Una venta cobrada a las 15:30 y subida a las 16:10 se
--    guardaba como de las 16:10: caía en el turno equivocado, desordenaba el
--    arqueo y corría la curva horaria de `ventas_por_momento`. Ahora la fecha
--    puede venir en el payload; sin ella, sigue siendo `now()`.
--
-- 3. QUÉ VENTA FUE OFFLINE. `registrada_offline` no es un adorno: es la
--    columna que permite auditar el único punto donde el sistema deja de
--    confiar en el server.
--
-- SOBRE `desfasaje_precio`, que es la parte incómoda y por eso se registra.
-- La regla del proyecto es que el precio se revalida SIEMPRE contra la base y
-- nunca se confía en el que manda el cliente. Una venta offline no puede
-- cumplirla: el precio que se le cobró a la clienta es el que la vendedora
-- tenía en la pantalla, y ese es el que hay que guardar — cambiarlo al
-- sincronizar sería emitir un ticket por un monto y registrar otro.
-- La decisión es cobrar por el precio del momento, y la contrapartida es que
-- la diferencia contra el precio actual queda GUARDADA: si un día una venta
-- offline aparece con un desfasaje grande, se ve. Sin esta columna, aceptar
-- el precio del cliente sería un agujero silencioso.
-- ---------------------------------------------------------------------------
alter table public.ventas
  add column if not exists registrada_offline boolean not null default false;

alter table public.ventas
  add column if not exists desfasaje_precio numeric;

comment on column public.ventas.registrada_offline is
  'La venta se cobró sin conexión y se sincronizó después. Su precio NO fue revalidado contra la base: ver desfasaje_precio.';

comment on column public.ventas.desfasaje_precio is
  'Solo en ventas offline: total cobrado menos total recalculado con los precios vigentes al sincronizar. 0 = el precio no cambió. null = no aplica.';

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
    recargo_cc_porcentaje, recargo_cc_monto,
    fecha_venta, registrada_offline, desfasaje_precio
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
    (p_venta->>'recargo_cc_monto')::numeric,
    -- La hora en que se cobró, no la hora en que llegó. Sin dato, `now()`.
    coalesce((p_venta->>'fecha_venta')::timestamptz, now()),
    coalesce((p_venta->>'registrada_offline')::boolean, false),
    (p_venta->>'desfasaje_precio')::numeric
  )
  on conflict (id) do nothing
  returning id, fecha_venta into v_venta_id, v_fecha_venta;

  -- La venta ya estaba: el intento anterior sí llegó y lo que se perdió fue la
  -- respuesta. Se sale ACÁ, antes de pagos, renglones, descuento, cuenta
  -- corriente y reservas: repetir cualquiera de esos sería cobrar dos veces.
  if v_venta_id is null then
    return jsonb_build_object(
      'ya_registrada', true,
      'venta_id', (p_venta->>'id')::uuid
    );
  end if;

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

      -- Delta sobre el saldo, no lectura-y-escritura. El vencimiento sale de la
      -- regla única; el coalesce es el fail-safe si el libro está descuadrado.
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
