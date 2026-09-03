-- Devolución parcial de una venta a CUENTA CORRIENTE.
--
-- ───────────────────────────────────────────────────────────────────────────
-- POR QUÉ ERA EL CASO MÁS IMPORTANTE Y NO EL BORDE
--
-- Medido en Evens, 90 días:
--
--   ventas a cuenta corriente ............ 128 de 626   (20,4%)
--   plata facturada en CC ................ $7.037.988 de $23.129.663 (30,4%)
--   ticket promedio CC ................... $54.984  contra $32.313 de contado
--   renglones promedio CC ................ 2,45     contra 1,96 general
--   ventas CC de más de un renglón ....... 70 de 128 (55%)
--
-- O sea que la cuenta corriente es un tercio de la plata, con tickets 70% más
-- grandes y MÁS renglones por ticket. La devolución parcial —que solo tiene
-- sentido con más de un renglón— hacía falta más acá que en contado, y era
-- justo lo que quedaba afuera.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE DESTRABÓ ESTO: NO HACE FALTA LA IMPUTACIÓN DE PAGOS
--
-- El bloqueo declarado era que los pagos de cuenta corriente no están
-- imputados a una venta (169 de 180 sin `venta_id`), así que ante un fiado a
-- medio pagar no se puede saber si lo devuelto ya estaba pagado.
--
-- Pero esa pregunta no hay que contestarla: la devolución baja la DEUDA, no
-- reconstruye qué se pagó. Es el mismo patrón que `anular_venta` ya usa desde
-- 20260816150000 — acreditar `least(reducción, saldo vivo)` y devolver el
-- remanente como aviso para que se resuelva a mano. En 95 de las 128 ventas de
-- CC el saldo del cliente cubre la deuda entera de esa venta, así que el
-- remanente ni aparece; y en un cambio rápido, que es el caso típico, la venta
-- es del día y no se pagó nada todavía.
--
-- ───────────────────────────────────────────────────────────────────────────
-- EL RECARGO DE CUENTA CORRIENTE SÍ SE PERDONA. EL DEL BANCO NO.
--
-- Son dos recargos distintos y la regla los separa por QUIÉN SE QUEDÓ CON LA
-- PLATA:
--
--   * Recargo por método (débito, tarjeta, billetera): NO se devuelve. Se lo
--     quedó el banco o la fintech, que no reintegra su comisión en una
--     devolución. Ver 20260903190000.
--   * Recargo de cuenta corriente (15% en Evens): SÍ se perdona, en la
--     proporción de lo devuelto. No se lo quedó nadie: es el precio de esperar
--     que cobra el propio comercio, y sobre mercadería que vuelve el mismo día
--     no hay espera que cobrar. En un cambio, el 15% pasa a corresponderle al
--     producto nuevo.
--
-- La regla en una línea: SE DEVUELVE LO QUE NADIE SE QUEDÓ.
--
-- Se perdona proporcionalmente a `recargo_cc_monto` —la plata que se cobró de
-- verdad— y no recalculando el porcentaje: si el recargo quedó redondeado al
-- peso al vender, el perdón sale de ese mismo número y no de uno nuevo.
--
-- ───────────────────────────────────────────────────────────────────────────
-- NO SALE PLATA DE LA CAJA. `ventas.monto_pendiente` NO SE TOCA.
--
-- Una devolución de un fiado baja el saldo del cliente; el cajón no se abre.
-- Y `monto_pendiente` queda como está por la misma razón por la que los pagos
-- de CC tampoco lo tocan: es la deuda CONGELADA al momento de la venta, y el
-- saldo vivo vive en `clientes.saldo_pendiente`. Moverlo acá haría que esa
-- columna signifique una cosa cuando paga y otra cuando devuelve.

begin;

alter table public.devoluciones
  add column if not exists recargo_cc_perdonado numeric not null default 0,
  add column if not exists credito_cc           numeric not null default 0,
  add column if not exists excedente_a_devolver numeric not null default 0;

comment on column public.devoluciones.recargo_cc_perdonado is
  'Recargo de cuenta corriente que se le perdona al cliente por lo devuelto. A diferencia del recargo por metodo de pago, este SI vuelve: no se lo quedo un tercero.';

comment on column public.devoluciones.credito_cc is
  'Cuanto bajo efectivamente la deuda del cliente. Acotado al saldo vivo con least(), igual que anular_venta.';

comment on column public.devoluciones.excedente_a_devolver is
  'Lo que la deuda no pudo absorber porque el cliente ya habia pagado de mas. NO se mueve solo: los pagos de CC no estan imputados a una venta, asi que la app lo avisa para resolverlo a mano.';

alter table public.ventas
  add column if not exists recargo_cc_devuelto numeric not null default 0;

comment on column public.ventas.recargo_cc_devuelto is
  'De monto_devuelto, cuanto es recargo de cuenta corriente perdonado. Suma con base_devuelta: monto_devuelto = base_devuelta + recargo_cc_devuelto, porque el recargo por metodo nunca se devuelve.';

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
  v_es_cc          boolean;
  v_recargo_cc     numeric := 0;
  v_reduccion      numeric := 0;
  v_saldo          numeric;
  v_credito        numeric := 0;
  v_excedente      numeric := 0;
  v_metodo_tipo    text;
  v_metodo_nombre  text;
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

  v_es_cc := coalesce(v_venta.monto_pendiente, 0) > 0;

  if v_es_cc then
    -- Camino cuenta corriente. La devolución baja la deuda; no hay cobro que
    -- mirar y el anticipo en efectivo, si lo hubo, no se toca.
    if v_venta.cliente_id is null then
      raise exception 'VENTA_CC_SIN_CLIENTE';
    end if;

    v_metodo_tipo := 'CUENTA_CORRIENTE';
    v_metodo_nombre := 'Cuenta corriente';
  else
    -- Camino contado: un solo cobro, y de un medio que se pueda devolver.
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

    v_metodo_tipo := v_pago.metodo_tipo;
    v_metodo_nombre := v_pago.metodo_nombre;
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

    -- El guard de concurrencia va DENTRO del UPDATE.
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

  if v_es_cc then
    -- Se perdona la parte proporcional del recargo de CC efectivamente
    -- cobrado. Sobre mercadería que vuelve no hay espera que cobrar.
    if coalesce(v_venta.recargo_cc_monto, 0) > 0 and v_base_total > 0 then
      v_recargo_cc := round(v_venta.recargo_cc_monto * v_base / v_base_total);
    end if;

    v_reduccion := v_base + v_recargo_cc;

    -- FOR UPDATE: el saldo se lee y se escribe en la misma transacción, así
    -- que el lock impide que un pago del cliente entrando al mismo tiempo se
    -- pise contra una lectura vieja.
    select coalesce(saldo_pendiente, 0) into v_saldo
      from public.clientes
     where id = v_venta.cliente_id
       for update;

    -- least(): no se puede acreditar más de lo que el cliente debe hoy. Si ya
    -- pagó de más, el excedente vuelve como aviso — la base no sabe con qué
    -- medio se cobró ese pago ni de qué ticket era.
    v_credito := least(v_reduccion, greatest(coalesce(v_saldo, 0), 0));
    v_excedente := v_reduccion - v_credito;

    if v_credito > 0 then
      insert into public.cuenta_corriente_movimientos (
        negocio_id, cliente_id, venta_id, tipo, monto, descripcion, creado_por
      ) values (
        v_negocio, v_venta.cliente_id, p_venta_id, 'CREDITO', v_credito,
        'Devolucion parcial - Venta #' || v_ticket, v_usuario
      );

      update public.clientes
         set saldo_pendiente = greatest(0, coalesce(saldo_pendiente, 0) - v_credito)
       where id = v_venta.cliente_id;
    end if;
  end if;

  insert into public.devoluciones (
    negocio_id, venta_id, base_devuelta, recargo_devuelto, monto_devuelto,
    recargo_cc_perdonado, credito_cc, excedente_a_devolver,
    metodo_tipo, metodo_nombre, turno_caja_id, motivo_codigo, motivo_detalle,
    creado_por
  ) values (
    v_negocio, p_venta_id, v_base, 0, v_base + v_recargo_cc,
    v_recargo_cc, v_credito, v_excedente,
    v_metodo_tipo, v_metodo_nombre,
    case when v_metodo_tipo = 'EFECTIVO' then p_turno_id end,
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
     set monto_devuelto      = coalesce(monto_devuelto, 0) + v_base + v_recargo_cc,
         base_devuelta       = coalesce(base_devuelta, 0) + v_base,
         recargo_cc_devuelto = coalesce(recargo_cc_devuelto, 0) + v_recargo_cc
   where id = p_venta_id;

  -- Solo el efectivo sale del cajón, y solo en el camino de contado. Un fiado
  -- devuelto baja la deuda: la caja no se toca.
  if v_metodo_tipo = 'EFECTIVO' and v_base > 0 then
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
    'es_cuenta_corriente', v_es_cc,
    'base_devuelta', v_base,
    'recargo_devuelto', 0,
    'recargo_cc_perdonado', v_recargo_cc,
    'monto_devuelto', v_base + v_recargo_cc,
    'credito_cc', v_credito,
    'excedente_a_devolver', v_excedente,
    'recargo_no_devuelto', case
      when coalesce(v_venta.recargo_metodo_total, 0) > 0 and v_base_total > 0
      then round(v_venta.recargo_metodo_total * v_base / v_base_total)
      else 0 end,
    'metodo_tipo', v_metodo_tipo,
    'metodo_nombre', v_metodo_nombre,
    'sale_de_caja', v_metodo_tipo = 'EFECTIVO',
    'venta_totalmente_devuelta', v_base_previa >= v_base_total
  );
end;
$$;

comment on function public.registrar_devolucion(uuid, jsonb, text, text, uuid) is
  'Devuelve renglones sueltos de una venta. Contado: solo EFECTIVO o '
  'TRANSFERENCIA y con un unico cobro; la plata sale de la caja si era '
  'efectivo. Cuenta corriente: baja la deuda del cliente acotada al saldo vivo '
  'y perdona la parte proporcional del recargo de CC; la caja no se toca. El '
  'recargo por metodo de pago NUNCA se devuelve. Ver 20260903200000.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'devoluciones'
       and column_name = 'recargo_cc_perdonado'
  ) then
    raise exception 'Falta devoluciones.recargo_cc_perdonado.';
  end if;

  -- La identidad que sostiene el neteo de los reportes.
  if exists (
    select 1 from public.ventas
     where round(monto_devuelto) <> round(base_devuelta + recargo_cc_devuelto)
  ) then
    raise exception 'Hay ventas donde monto_devuelto no es base_devuelta + recargo_cc_devuelto.';
  end if;
end $$;

commit;
