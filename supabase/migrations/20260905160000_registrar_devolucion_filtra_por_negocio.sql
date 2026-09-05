-- ---------------------------------------------------------------------------
-- `registrar_devolucion` filtra por `negocio_id` en TODAS sus consultas.
--
-- EL PROBLEMA. La función es SECURITY DEFINER, así que ninguna de sus lecturas
-- pasa por RLS: ve la base entera. Validaba el negocio de la VENTA
-- (`v_venta.negocio_id is distinct from v_negocio` → VENTA_INEXISTENTE) y
-- después consultaba las tablas hijas solo por `venta_id`, confiando en que
-- todo lo que cuelga de una venta propia es propio. No lo es: hasta
-- `20260905140000` la policy de INSERT de `venta_pagos` era `true`, y la de
-- `ventas_items` LO SIGUE SIENDO, así que un usuario de otro comercio puede
-- dejar filas colgando de una venta ajena.
--
-- QUÉ HABILITABA. Con un cobro fantasma agregado desde otro negocio:
--   * `v_cobros` daba 2 y la venta quedaba SIN PODER DEVOLVERSE para siempre
--     ('VENTA_CON_PAGO_MIXTO'), sin que la víctima pudiera ver ni borrar la
--     fila (RLS se la esconde y no hay policy de DELETE).
--   * Si la venta atacada no tenía cobros, `v_cobros` daba 1 y `v_pago` pasaba
--     a ser LA FILA DEL ATACANTE: la devolución se emitía con su método y su
--     nombre, y el egreso de caja salía por EFECTIVO si él lo eligió.
--   * Vía `ventas_items`, un renglón fantasma infla `v_base_total`, que es el
--     denominador del prorrateo del recargo de cuenta corriente y la base del
--     flag `venta_totalmente_devuelta`.
--
-- SEIS CONSULTAS CORREGIDAS (las demás ya filtraban o derivan de `v_venta`,
-- que sí está validada):
--   1. count de cobros en `venta_pagos`
--   2. select del cobro en `venta_pagos`
--   3. sum de `ventas_items` para `v_base_total` / `v_base_previa`
--   4. select del saldo en `clientes`  (+ chequeo de que exista)
--   5. update de `clientes.saldo_pendiente`
--   6. update de `ventas` con lo devuelto
--
-- El `update ventas_items` del loop ya tenía `and negocio_id = v_negocio`.
--
-- CUERPO TOMADO DE `pg_get_functiondef` EL 5/9/2026, no del último archivo que
-- tocó la función. Es la lección de `20260904140000`: `create or replace
-- function` no avisa de nada, y reescribir desde una copia vieja se lleva
-- puesto lo que se agregó en el medio. Lo único que cambia respecto del cuerpo
-- vivo son los seis filtros y el chequeo de cliente inexistente.
--
-- LO QUE NO ARREGLA: la policy `"Permitir insertar items"` de `ventas_items`
-- sigue siendo `with check (true)`, igual que estaba `venta_pagos`. Esta
-- migración impide que esas filas hagan daño ACÁ, no que se creen. Cerrar esa
-- policy es el mismo movimiento que `20260905140000` y va aparte.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_devolucion(p_venta_id uuid, p_lineas jsonb, p_motivo_codigo text DEFAULT NULL::text, p_motivo_detalle text DEFAULT NULL::text, p_turno_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'security', 'pg_temp'
AS $function$
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
    if v_venta.cliente_id is null then
      raise exception 'VENTA_CC_SIN_CLIENTE';
    end if;

    v_metodo_tipo := 'CUENTA_CORRIENTE';
    v_metodo_nombre := 'Cuenta corriente';
  else
    -- SECURITY DEFINER: sin `negocio_id` acá, un cobro insertado desde otro
    -- comercio contra esta venta cuenta como si fuera propio.
    select count(*) into v_cobros
      from public.venta_pagos
     where venta_id = p_venta_id
       and negocio_id = v_negocio
       and tipo_movimiento = 'PAGO_VENTA';

    if v_cobros <> 1 then
      raise exception 'VENTA_CON_PAGO_MIXTO';
    end if;

    select * into v_pago
      from public.venta_pagos
     where venta_id = p_venta_id
       and negocio_id = v_negocio
       and tipo_movimiento = 'PAGO_VENTA';

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

  -- `v_base_total` es el denominador del prorrateo del recargo de cuenta
  -- corriente y la base de `venta_totalmente_devuelta`: un renglón fantasma de
  -- otro negocio lo inflaría.
  select coalesce(sum(precio_final * cantidad), 0),
         coalesce(sum(precio_final * cantidad_devuelta), 0)
    into v_base_total, v_base_previa
    from public.ventas_items
   where venta_id = p_venta_id
     and negocio_id = v_negocio;

  if v_es_cc then
    if coalesce(v_venta.recargo_cc_monto, 0) > 0 and v_base_total > 0 then
      v_recargo_cc := round(v_venta.recargo_cc_monto * v_base / v_base_total);
    end if;

    v_reduccion := v_base + v_recargo_cc;

    select coalesce(saldo_pendiente, 0) into v_saldo
      from public.clientes
     where id = v_venta.cliente_id
       and negocio_id = v_negocio
       for update;

    if not found then
      raise exception 'CLIENTE_INEXISTENTE';
    end if;

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
       where id = v_venta.cliente_id
         and negocio_id = v_negocio;
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
   where id = p_venta_id
     and negocio_id = v_negocio;

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
$function$;

-- ---------------------------------------------------------------------------
-- Guard: el cuerpo que quedó tiene que tener los filtros y seguir teniendo lo
-- que ya tenía. Mismo criterio que `20260904140000`: si una reescritura futura
-- parte de una copia vieja, esto lo caza.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def   text;
  v_filtros int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_devolucion';

  select count(*) into v_filtros
    from regexp_matches(v_def, 'negocio_id = v_negocio', 'g');

  if v_filtros < 6 then
    raise exception 'registrar_devolucion quedó con % filtros de negocio_id, esperaba al menos 6.', v_filtros;
  end if;

  if v_def !~ 'VENTA_CON_PAGO_MIXTO' or v_def !~ 'DEVOLUCION_EXCEDE_LO_VENDIDO'
     or v_def !~ 'venta_totalmente_devuelta' then
    raise exception 'registrar_devolucion perdió lógica que tenía antes de esta migración.';
  end if;
end $$;
