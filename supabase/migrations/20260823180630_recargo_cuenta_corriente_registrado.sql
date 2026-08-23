-- ---------------------------------------------------------------------------
-- El recargo de cuenta corriente pasa a quedar REGISTRADO.
--
-- Hasta ahora el recargo por fiar existía y se cobraba —`configuracion_pos.
-- cc_recargo_default`, recalculado server-side en create-sale.ts, 15% en
-- Evens— pero se disolvía dentro de `ventas.total`. No había ninguna columna
-- que dijera cuánto de ese total era mercadería y cuánto era el precio de
-- esperar. El propio código lo decía:
--
--   "Sin columna que lo registre, el log es el único rastro de que esta venta
--    se fió sin el recargo que la config exige."
--
-- Consecuencia práctica: no se podía responder "¿me conviene fiar al 15% o
-- cobrar con tarjeta al 15%?", que es justo la pregunta que el comercio
-- necesita. El dato para contestarla se estaba generando y tirando.
--
-- Qué se agrega, y dónde:
--
--   * `ventas.recargo_cc_porcentaje` / `ventas.recargo_cc_monto`: el recargo
--     a nivel TICKET. Congelado en la fila, igual que `venta_pagos.
--     recargo_monto` y por el mismo motivo: si mañana la config pasa de 15% a
--     20%, lo ya vendido tiene que seguir diciendo 15.
--   * `cuenta_corriente_movimientos.recargo_porcentaje`, y se empieza a
--     escribir `monto_recargo`, que existía desde el esquema maestro y estaba
--     en 0 en los 220 movimientos vivos. El DEBITO de CC es la deuda TOTAL
--     (base + recargo − seña); esta columna dice qué parte de esa deuda es
--     recargo.
--
-- Lo que NO se toca, a propósito: `venta_pagos`. La tentación era darle al
-- fiado su propia fila ahí, para que "cuenta corriente" fuera un método de
-- pago más y todo se comparara con una sola consulta. No se hace porque esa
-- tabla es, para el resto del sistema, PLATA QUE ENTRÓ: `posicion_dinero`
-- arma su bloque de "por acreditar" con `metodo_tipo <> 'EFECTIVO'` y sin
-- mirar `tipo_movimiento`, así que una fila de fiado se contaría como plata
-- en camino; y nueve lugares en TypeScript suman `venta_pagos` embebido en la
-- venta como cobrado. La comparación entre medios se arma en
-- `rentabilidad_por_metodo` (migración siguiente), que es un lugar de
-- LECTURA y no puede romper un arqueo.
--
-- Las columnas son NULLABLE y sin default a propósito: null significa "no se
-- sabe" (ventas viejas donde la aritmética no cierra) y es distinto de 0, que
-- significa "se fió sin recargo". Un default 0 habría borrado esa diferencia
-- justo en las filas donde importa.
-- ---------------------------------------------------------------------------

alter table public.ventas
  add column if not exists recargo_cc_porcentaje numeric(5,2),
  add column if not exists recargo_cc_monto      numeric(12,2);

comment on column public.ventas.recargo_cc_porcentaje is
  'Porcentaje de recargo por cuenta corriente aplicado a ESTA venta, congelado. null = no determinable (ventas anteriores a 20260823180630); 0 = se fió sin recargo.';
comment on column public.ventas.recargo_cc_monto is
  'Monto del recargo por cuenta corriente incluido en ventas.total. Se calcula sobre el subtotal con descuento, ANTES del recargo por método de pago.';

alter table public.cuenta_corriente_movimientos
  add column if not exists recargo_porcentaje numeric(5,2);

comment on column public.cuenta_corriente_movimientos.recargo_porcentaje is
  'Porcentaje de recargo aplicado al DEBITO. Acompaña a monto_recargo, que hasta 20260823180630 existía pero nunca se escribía.';
comment on column public.cuenta_corriente_movimientos.monto_recargo is
  'Parte de `monto` que es recargo por fiar, no mercadería. En los CREDITO no aplica.';

-- ---------------------------------------------------------------------------
-- Backfill de lo ya vendido.
--
-- El recargo es reconstruible porque la aritmética de create-sale.ts es
-- cerrada y todos sus términos están guardados:
--
--   total = (Σ precio_final × cantidad − descuento) * (1 + pct/100)
--           + recargo_metodo_total
--
-- Se escribe SOLO donde la cuenta cierra al peso contra el pct configurado
-- hoy, o contra 0. Donde no cierra —config cambiada a mitad de camino, o el
-- flag `cc_sin_recargo` de la vendedora sobre un porcentaje que ya no es el
-- de hoy— queda null. Inventar el número para las filas que no cierran sería
-- exactamente el tipo de dato que después nadie puede auditar.
--
-- Medido antes de aplicar, sobre las 95 ventas fiadas de Evens de los últimos
-- 30 días: 83 cierran con 15%, 8 cierran con 0%, 4 no cierran con ninguno.
-- ---------------------------------------------------------------------------
with base as (
  select
    v.id,
    v.negocio_id,
    coalesce(c.cc_recargo_default, 0)                        as pct,
    coalesce(v.total, 0) - coalesce(v.recargo_metodo_total, 0) as sin_recargo_metodo,
    -- × cantidad: `ventas_items.precio_final` es UNITARIO. Ver 20260823184214.
    coalesce((select sum(i.precio_final * i.cantidad) from public.ventas_items i where i.venta_id = v.id), 0)
    - coalesce((select sum(d.monto_descontado) from public.ventas_descuentos d where d.venta_id = v.id), 0)
                                                             as subtotal
  from public.ventas v
  join public.configuracion_pos c on c.negocio_id = v.negocio_id
  where coalesce(v.monto_pendiente, 0) > 0
    and v.recargo_cc_porcentaje is null
),
resuelto as (
  select
    id,
    case
      when pct > 0 and abs(subtotal * (1 + pct / 100.0) - sin_recargo_metodo) <= 1 then pct
      when abs(subtotal - sin_recargo_metodo) <= 1                                then 0
    end as pct_resuelto,
    subtotal
  from base
)
update public.ventas v
   set recargo_cc_porcentaje = r.pct_resuelto,
       recargo_cc_monto      = round(r.subtotal * r.pct_resuelto / 100.0, 2)
  from resuelto r
 where v.id = r.id
   and r.pct_resuelto is not null;

-- El movimiento de cuenta corriente hereda lo que se pudo resolver en la
-- venta. Se topea contra `monto` porque la deuda puede ser menor que el
-- recargo del ticket cuando hubo una seña grande: en ese caso el recargo ya
-- se cobró en la entrega y lo que queda debiendo es todo recargo.
update public.cuenta_corriente_movimientos m
   set monto_recargo      = least(coalesce(v.recargo_cc_monto, 0), m.monto),
       recargo_porcentaje = v.recargo_cc_porcentaje
  from public.ventas v
 where v.id = m.venta_id
   and m.tipo = 'DEBITO'
   and m.recargo_porcentaje is null
   and v.recargo_cc_porcentaje is not null;

-- ---------------------------------------------------------------------------
-- `registrar_venta`: escribe el recargo en vez de dejarlo disuelto en total.
--
-- La firma NO cambia — los campos nuevos viajan dentro de los jsonb que ya
-- recibía. Una versión vieja de create-sale.ts que no los mande sigue
-- funcionando: `->>` sobre una clave ausente da null, que es justamente
-- "no se sabe".
--
-- Todo lo demás es idéntico a 20260819234607.
-- ---------------------------------------------------------------------------
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
  v_recargo_cc numeric;
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
    -- ERA ::int. Ver la cabecera de 20260819234607.
    (p_venta->>'cantidad')::numeric,
    (p_venta->>'total_bruto')::numeric,
    (p_venta->>'recargo_metodo_total')::numeric,
    (p_venta->>'comision_total')::numeric,
    (p_venta->>'total_neto')::numeric,
    (p_venta->>'es_pago_mixto')::boolean,
    (p_venta->>'monto_cobrado')::numeric,
    (p_venta->>'monto_pendiente')::numeric,
    p_venta->>'estado_pago',
    -- Nuevos. Ausentes = null = "no se sabe", que es lo correcto para un
    -- caller viejo; create-sale.ts los manda siempre, 0 incluido.
    (p_venta->>'recargo_cc_porcentaje')::numeric,
    (p_venta->>'recargo_cc_monto')::numeric
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

      -- Qué parte de la deuda es recargo. Topeado contra la deuda: con una
      -- seña grande el recargo ya se cobró en la entrega, y lo que queda
      -- debiendo no puede ser más recargo que deuda.
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

revoke all on function public.registrar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[]) from public;
grant execute on function public.registrar_venta(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[]) to authenticated;

-- Guard heredado de 20260819234607: la cantidad de la cabecera no puede
-- volver a castearse a integer.
do $$
declare v_restantes int;
begin
  select count(*) into v_restantes
  from (
    select l from regexp_split_to_table(
      pg_get_functiondef('public.registrar_venta(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[])'::regprocedure),
      E'\n') as l
    where l ~* '(::int\M|::integer\M)' and l ~* 'cantidad'
  ) x;

  if v_restantes > 0 then
    raise exception 'Quedaron % casteos de cantidad a integer en registrar_venta', v_restantes;
  end if;
end;
$$;

-- Guard propio: `venta_pagos` no debe recibir filas de fiado. Si algún día
-- alguien decide que sí, tiene que ser una decisión explícita que además
-- arregle posicion_dinero y los consumidores de TypeScript — no un efecto
-- lateral de esta migración.
do $$
begin
  if pg_get_functiondef('public.registrar_venta(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid[])'::regprocedure)
     ~* 'FIADO_VENTA' then
    raise exception 'registrar_venta está escribiendo fiado en venta_pagos: revisar posicion_dinero antes';
  end if;
end;
$$;
