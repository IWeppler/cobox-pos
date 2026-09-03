-- El recargo por método de pago NO se devuelve. Solo el valor del producto.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POR QUÉ, Y POR QUÉ ESTABA MAL
--
-- `registrar_devolucion` (20260903160000) prorrateaba el recargo del ticket y
-- lo devolvía junto con la mercadería. Es incorrecto, y el motivo es que el
-- recargo NO es del comercio: cuando un ticket lleva recargo por débito,
-- tarjeta o billetera, es porque el banco o la fintech le descuenta esa
-- comisión al comercio. En una devolución el procesador NO reintegra su
-- comisión — se la quedó igual. Devolviéndole el recargo a la clienta, el
-- comercio pone esa plata de su bolsillo.
--
--   ticket con 15% de recargo sobre $100.000:
--     la clienta pagó ......................... $115.000
--     el banco le retuvo al comercio .......... ~$15.000
--     el comercio recibió ..................... ~$100.000
--
--   devolviendo todo con la regla vieja:
--     se le devolvía a la clienta ............. $115.000
--     el comercio recuperaba del banco ........ $0
--     resultado ............................... $15.000 de pérdida
--
-- Ahora se devuelve la BASE: lo que vale el producto. Es la misma lógica que
-- ya distingue `metodos_pago.comision` (lo que el comercio le paga al
-- procesador) de `recargo_porcentaje` (lo que le cobra al cliente) — ver
-- `shared/lib/recargo-metodo.ts`.
--
-- ───────────────────────────────────────────────────────────────────────────
-- HOY NO CAMBIA NINGÚN NÚMERO, Y IGUAL HAY QUE ARREGLARLO
--
-- La devolución parcial solo admite EFECTIVO y TRANSFERENCIA, y en los siete
-- comercios los dos están al 0% de recargo. O sea que con los datos de hoy la
-- regla vieja y la nueva dan lo mismo. Se corrige igual porque el día que se
-- habilite tarjeta —15% en Evens— la regla vieja empieza a costar plata en
-- cada devolución, y ese es justo el día en que nadie va a estar mirando esta
-- función.
--
-- `devoluciones.recargo_devuelto` queda en 0 y no se elimina: la columna
-- documenta que la decisión se tomó, y si algún día una política distinta
-- devuelve parte del recargo, tiene dónde escribirse.
--
-- ───────────────────────────────────────────────────────────────────────────
-- OJO, QUEDA UNA INCONSISTENCIA CONOCIDA
--
-- `anular_venta` SÍ devuelve el recargo: reintegra `monto_bruto`, que es base
-- más recargo. Con lo de arriba, anular una venta con tarjeta le regala al
-- cliente el recargo que el banco no reintegra. No se toca acá a propósito —
-- es un camino vivo, usado 26 veces, y cambiar cómo mueve la plata una
-- operación en producción es una decisión aparte, no un efecto colateral de
-- esta migración. Queda anotado para resolverlo con quien corresponde.

begin;

comment on column public.devoluciones.recargo_devuelto is
  'Siempre 0 desde 20260903190000: el recargo por metodo de pago no se devuelve porque el banco o la fintech no reintegra su comision. Se conserva la columna por si una politica futura devuelve parte.';

create or replace function public.registrar_devolucion(
  p_venta_id uuid,
  p_lineas jsonb,
  p_motivo_codigo text default null,
  p_motivo_detalle text default null,
  p_turno_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_negocio        uuid := security.current_negocio_id();
  v_usuario        uuid := auth.uid();
  v_venta          public.ventas%rowtype;
  v_pago           public.venta_pagos%rowtype;
  v_cobros         int;
  v_linea          jsonb;
  v_item           public.ventas_items%rowtype;
  v_cantidad       numeric;
  v_destino        text;
  v_base           numeric := 0;
  v_base_total     numeric;
  v_base_previa    numeric;
  v_devolucion_id  uuid;
  v_items          jsonb := '[]'::jsonb;
  v_ticket         text := upper(split_part(p_venta_id::text, '-', 1));
begin
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  if not public.tiene_permiso('ventas.devolver') then
    raise exception 'SIN_PERMISO';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'SIN_RENGLONES';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found or v_venta.negocio_id is distinct from v_negocio then
    raise exception 'VENTA_INEXISTENTE';
  end if;

  if v_venta.vendedor_id is distinct from v_usuario
     and not public.tiene_permiso('ventas.ver_todas') then
    raise exception 'VENTA_AJENA';
  end if;

  if v_venta.estado_operacion <> 'CONFIRMADA' then
    raise exception 'VENTA_NO_DEVOLVIBLE';
  end if;

  if coalesce(v_venta.monto_pendiente, 0) > 0 then
    raise exception 'VENTA_CON_CUENTA_CORRIENTE';
  end if;

  select count(*) into v_cobros
    from public.venta_pagos
   where venta_id = p_venta_id and tipo_movimiento = 'PAGO_VENTA';

  if v_cobros <> 1 then
    raise exception 'VENTA_CON_PAGO_MIXTO';
  end if;

  select * into v_pago
    from public.venta_pagos
   where venta_id = p_venta_id and tipo_movimiento = 'PAGO_VENTA';

  if v_pago.metodo_tipo not in ('EFECTIVO', 'TRANSFERENCIA') then
    raise exception 'METODO_NO_DEVOLVIBLE';
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_destino  := coalesce(v_linea->>'destino', 'STOCK');

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'CANTIDAD_INVALIDA';
    end if;

    if v_destino not in ('STOCK', 'BAJA') then
      raise exception 'DESTINO_INVALIDO';
    end if;

    -- El guard de concurrencia va DENTRO del UPDATE: dos devoluciones
    -- simultáneas del mismo renglón no pueden pasar las dos.
    update public.ventas_items
       set cantidad_devuelta = cantidad_devuelta + v_cantidad
     where id = (v_linea->>'venta_item_id')::uuid
       and venta_id = p_venta_id
       and negocio_id = v_negocio
       and cantidad_devuelta + v_cantidad <= cantidad
    returning * into v_item;

    if not found then
      raise exception 'DEVOLUCION_EXCEDE_LO_VENDIDO';
    end if;

    -- `precio_final` ya tiene restado el descuento del renglón, así que esto
    -- es exactamente lo que la clienta pagó por esa mercadería.
    v_base := v_base + (v_item.precio_final * v_cantidad);

    v_items := v_items || jsonb_build_object(
      'venta_item_id', v_item.id,
      'variante_id',   v_item.variante_id,
      'cantidad',      v_cantidad,
      'precio_final',  v_item.precio_final,
      'destino',       v_destino
    );
  end loop;

  select coalesce(sum(precio_final * cantidad), 0),
         coalesce(sum(precio_final * cantidad_devuelta), 0)
    into v_base_total, v_base_previa
    from public.ventas_items
   where venta_id = p_venta_id;

  insert into public.devoluciones (
    negocio_id, venta_id, base_devuelta, recargo_devuelto, monto_devuelto,
    metodo_tipo, metodo_nombre, turno_caja_id, motivo_codigo, motivo_detalle,
    creado_por
  ) values (
    -- recargo_devuelto en 0 y monto = base: el recargo se lo quedó el banco.
    v_negocio, p_venta_id, v_base, 0, v_base,
    v_pago.metodo_tipo, v_pago.metodo_nombre,
    case when v_pago.metodo_tipo = 'EFECTIVO' then p_turno_id end,
    p_motivo_codigo,
    nullif(btrim(coalesce(p_motivo_detalle, '')), ''),
    v_usuario
  )
  returning id into v_devolucion_id;

  insert into public.devoluciones_items (
    negocio_id, devolucion_id, venta_item_id, variante_id,
    cantidad, precio_final, destino
  )
  select v_negocio, v_devolucion_id, r.venta_item_id, r.variante_id,
         r.cantidad, r.precio_final, r.destino
    from jsonb_to_recordset(v_items) as r(
      venta_item_id uuid, variante_id uuid, cantidad numeric,
      precio_final numeric, destino text
    );

  update public.ventas
     set monto_devuelto = coalesce(monto_devuelto, 0) + v_base,
         base_devuelta  = coalesce(base_devuelta, 0) + v_base
   where id = p_venta_id;

  if v_pago.metodo_tipo = 'EFECTIVO' and v_base > 0 then
    insert into public.egresos (negocio_id, concepto, monto, creado_por, turno_caja_id)
    values (
      v_negocio,
      'Devolucion parcial - Venta #' || v_ticket,
      round(v_base)::int,
      v_usuario,
      p_turno_id
    );
  end if;

  return jsonb_build_object(
    'devolucion_id', v_devolucion_id,
    'base_devuelta', v_base,
    'recargo_devuelto', 0,
    'monto_devuelto', v_base,
    'recargo_no_devuelto', case
      when coalesce(v_venta.recargo_metodo_total, 0) > 0 and v_base_total > 0
      then round(v_venta.recargo_metodo_total * v_base / v_base_total)
      else 0 end,
    'metodo_tipo', v_pago.metodo_tipo,
    'metodo_nombre', v_pago.metodo_nombre,
    'sale_de_caja', v_pago.metodo_tipo = 'EFECTIVO',
    'venta_totalmente_devuelta', v_base_previa >= v_base_total
  );
end;
$$;

comment on function public.registrar_devolucion(uuid, jsonb, text, text, uuid) is
  'Devuelve renglones sueltos de una venta cobrada con UN metodo, EFECTIVO o '
  'TRANSFERENCIA. Devuelve SOLO el valor del producto: el recargo por metodo '
  'de pago no se reintegra porque el banco tampoco reintegra su comision. Ver '
  '20260903190000.';

do $$
begin
  -- Ninguna devolución existente puede haber devuelto recargo. Hoy no hay
  -- ninguna, pero si esta migración se aplicara tarde el guard lo diría.
  if exists (select 1 from public.devoluciones where recargo_devuelto <> 0) then
    raise exception 'Hay devoluciones que ya reintegraron recargo: revisar antes de seguir.';
  end if;
end $$;

commit;
