-- `ventas.base_devuelta`: la parte de lo devuelto que es MERCADERÍA.
--
-- Sale de escribir el consumidor de `monto_devuelto` y encontrarle un borde a
-- la primera. El panel y /reportes no suman `ventas.total` sino
-- `total - recargo_metodo_total`, para que "Ingresos" y "Ganancia bruta"
-- hablen solo de mercadería y el recargo se cuente aparte. Restarles
-- `monto_devuelto` —que ya trae adentro el recargo prorrateado— bajaría los
-- ingresos de mercadería por plata que nunca fue mercadería, y dejaría el
-- recargo cobrado sin descontar.
--
-- Con las dos columnas la resta es simétrica a la suma:
--
--     ingresos  += (total - recargo_metodo_total) - base_devuelta
--     recargos  += recargo_metodo_total - (monto_devuelto - base_devuelta)
--
-- Va como columna y no como `sum()` sobre `devoluciones` por lo mismo que
-- `monto_devuelto`: los consumidores son doce y varios corren en el cliente
-- sobre lo que ya trajo `getVentasAction`. Un join más por cada uno es un
-- viaje más a Ohio en el camino que ya es el más caro.
--
-- SIN BACKFILL, y no por olvido: al aplicar esto no existe ni una fila en
-- `devoluciones`. La columna nace en cero porque lo devuelto hasta hoy es
-- cero.

begin;

alter table public.ventas
  add column if not exists base_devuelta numeric not null default 0;

comment on column public.ventas.base_devuelta is
  'De monto_devuelto, cuanto es mercaderia (sin el recargo prorrateado). Los reportes restan esto de los ingresos y la diferencia del recargo cobrado. Ver 20260903170000.';

-- La función pasa a escribir las dos. Es `create or replace` sin cambio de
-- firma, así que no hay ventana de ambigüedad como en `anular_venta`.
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
  v_recargo_total  numeric;
  v_recargo_previo numeric;
  v_base_previa    numeric;
  v_recargo        numeric;
  v_monto          numeric;
  v_devolucion_id  uuid;
  v_items          jsonb := '[]'::jsonb;
  v_ticket         text := upper(split_part(p_venta_id::text, '-', 1));
  v_todo_devuelto  boolean;
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

  v_recargo_total := coalesce(v_venta.recargo_metodo_total, 0);

  select coalesce(sum(recargo_devuelto), 0) into v_recargo_previo
    from public.devoluciones where venta_id = p_venta_id;

  v_todo_devuelto := v_base_previa >= v_base_total;

  if v_recargo_total <= 0 or v_base_total <= 0 then
    v_recargo := 0;
  elsif v_todo_devuelto then
    v_recargo := v_recargo_total - v_recargo_previo;
  else
    v_recargo := round(v_recargo_total * v_base / v_base_total);
  end if;

  v_monto := v_base + v_recargo;

  insert into public.devoluciones (
    negocio_id, venta_id, base_devuelta, recargo_devuelto, monto_devuelto,
    metodo_tipo, metodo_nombre, turno_caja_id, motivo_codigo, motivo_detalle,
    creado_por
  ) values (
    v_negocio, p_venta_id, v_base, v_recargo, v_monto,
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
     set monto_devuelto = coalesce(monto_devuelto, 0) + v_monto,
         base_devuelta  = coalesce(base_devuelta, 0) + v_base
   where id = p_venta_id;

  if v_pago.metodo_tipo = 'EFECTIVO' and v_monto > 0 then
    insert into public.egresos (negocio_id, concepto, monto, creado_por, turno_caja_id)
    values (
      v_negocio,
      'Devolucion parcial - Venta #' || v_ticket,
      round(v_monto)::int,
      v_usuario,
      p_turno_id
    );
  end if;

  return jsonb_build_object(
    'devolucion_id', v_devolucion_id,
    'base_devuelta', v_base,
    'recargo_devuelto', v_recargo,
    'monto_devuelto', v_monto,
    'metodo_tipo', v_pago.metodo_tipo,
    'metodo_nombre', v_pago.metodo_nombre,
    'sale_de_caja', v_pago.metodo_tipo = 'EFECTIVO',
    'venta_totalmente_devuelta', v_base_previa >= v_base_total
  );
end;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ventas'
       and column_name = 'base_devuelta'
  ) then
    raise exception 'Falta ventas.base_devuelta.';
  end if;

  -- Invariante: lo devuelto nunca puede ser mas que lo vendido.
  if exists (select 1 from public.ventas where monto_devuelto > total) then
    raise exception 'Hay ventas con mas devuelto que su total.';
  end if;
end $$;

commit;
