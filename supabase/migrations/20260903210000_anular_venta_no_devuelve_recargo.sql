-- Anular tampoco devuelve el recargo por método de pago.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LA INCONSISTENCIA QUE CIERRA
--
-- Desde 20260903190000 la devolución parcial devuelve SOLO el valor del
-- producto: el recargo por débito, tarjeta o billetera no se reintegra porque
-- el banco tampoco reintegra la comisión que le retuvo al comercio.
--
-- `anular_venta` seguía haciendo lo contrario: devolvía `monto_bruto`, que es
-- base MÁS recargo. O sea que la misma operación —devolver mercadería— movía
-- distinta plata según si volvía todo el ticket o una parte. Peor: el camino
-- que devolvía de más era el de anular, que es el que hoy se usa de verdad.
--
--   ticket de $100.000 con 15% de recargo por tarjeta
--     la clienta pagó ................... $115.000
--     el banco le retuvo al comercio .... ~$15.000
--     anular le devolvía ................ $115.000  ← $15.000 de pérdida
--     anular le devuelve ahora .......... $100.000
--
-- ───────────────────────────────────────────────────────────────────────────
-- EL CAMBIO ES UNA PALABRA, Y ESTABA VERIFICADO ANTES DE HACERLO
--
-- `monto_bruto` pasa a `monto_base`. Eso solo es seguro si todos los cobros
-- tienen la base cargada, porque un cobro viejo con `monto_base` en 0 pasaría
-- a devolver CERO. Medido sobre los 861 cobros de venta de la base, del 3/5 al
-- 3/9: ninguno tiene `monto_base` en 0, y la invariante
-- `monto_base + recargo_monto = monto_bruto` se cumple en los 861.
--
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ NO CAMBIA
--
-- El crédito de CUENTA CORRIENTE sigue igual, y es correcto que siga: acredita
-- `least(monto_pendiente, saldo vivo)`, y `monto_pendiente` incluye el recargo
-- de cuenta corriente. Ese recargo SÍ se perdona —no se lo quedó ningún
-- tercero, es el precio de esperar que cobra el propio comercio— igual que en
-- la devolución parcial de un fiado (20260903200000).
--
-- La regla, la misma de siempre: SE DEVUELVE LO QUE NADIE SE QUEDÓ.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LO YA ANULADO NO SE TOCA
--
-- Hay 17 cobros con recargo en toda la base ($136.925), y NINGUNO pertenece a
-- una venta anulada: hasta hoy nadie anuló una venta con recargo, así que no
-- se regaló un peso y no hay nada que corregir hacia atrás. La migración
-- cambia el futuro, no reescribe egresos ya emitidos — un egreso es plata que
-- salió del cajón y se corrige con otro movimiento, nunca editándolo.

begin;

drop function if exists public.anular_venta(uuid, text, uuid, text, text);

create function public.anular_venta(
  p_venta_id uuid,
  p_motivo text,
  p_turno_id uuid default null,
  p_motivo_codigo text default null,
  p_motivo_detalle text default null
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
  v_recargo numeric;
  v_saldo numeric;
  v_credito numeric := 0;
  v_excedente numeric := 0;
  v_ticket text := upper(split_part(p_venta_id::text, '-', 1));
begin
  if v_negocio is null then
    raise exception 'SIN_NEGOCIO_ACTIVO';
  end if;

  -- El guard va PRIMERO y es un UPDATE condicional, no un SELECT: toma el row
  -- lock que serializa dos anulaciones simultáneas.
  update public.ventas
     set estado_operacion   = 'ANULADA',
         estado_pago        = 'ANULADA',
         motivo_anulacion   = p_motivo,
         destino_mercaderia = p_motivo,
         motivo_codigo      = p_motivo_codigo,
         motivo_detalle     = nullif(btrim(coalesce(p_motivo_detalle, '')), ''),
         anulada_por        = auth.uid(),
         anulada_en         = now()
   where id = p_venta_id
     and estado_operacion <> 'ANULADA'
  returning cliente_id, coalesce(monto_pendiente, 0)
       into v_cliente, v_pendiente;

  if not found then
    raise exception 'VENTA_NO_ANULABLE';
  end if;

  update public.venta_pagos
     set estado_pago_operacion = 'ANULADO'
   where venta_id = p_venta_id;

  -- Se devuelve la BASE, no el bruto: el recargo por método se lo quedó el
  -- banco y no lo reintegra. Ver el encabezado. `v_recargo` viaja de vuelta
  -- para que la app pueda decir cuánto NO se devolvió y por qué.
  select
    coalesce(sum(monto_base) filter (where metodo_tipo = 'EFECTIVO'), 0),
    coalesce(sum(monto_base) filter (where metodo_tipo <> 'EFECTIVO'), 0),
    coalesce(sum(recargo_monto), 0)
    into v_efectivo, v_otros, v_recargo
  from public.venta_pagos
  where venta_id = p_venta_id;

  if v_efectivo > 0 then
    insert into public.egresos (negocio_id, concepto, monto, creado_por, turno_caja_id)
    values (
      v_negocio,
      'Devolucion en efectivo - Venta #' || v_ticket,
      round(v_efectivo)::int,
      auth.uid(),
      p_turno_id
    );
  end if;

  -- Cuenta corriente: sin cambios. `monto_pendiente` incluye el recargo de CC,
  -- que SÍ se perdona porque no se lo quedó ningún tercero.
  if v_cliente is not null and v_pendiente > 0 then
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
          'Anulacion de Venta #' || v_ticket, auth.uid()
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
    'recargo_no_devuelto', v_recargo,
    'credito_aplicado', v_credito,
    'excedente_ya_pagado', v_excedente,
    'cliente_id', v_cliente
  );
end;
$$;

comment on function public.anular_venta(uuid, text, uuid, text, text) is
  'Anula una venta en UNA transaccion: estado, auditoria, cobros, egreso de '
  'caja por la porcion en EFECTIVO y credito de cuenta corriente acotado al '
  'saldo vivo. Devuelve la BASE de cada cobro, no el bruto: el recargo por '
  'metodo de pago no se reintegra porque el banco tampoco reintegra su '
  'comision. El stock y las unidades serializadas quedan afuera. '
  'Ver 20260903210000.';

revoke all on function public.anular_venta(uuid, text, uuid, text, text) from public;
grant execute on function public.anular_venta(uuid, text, uuid, text, text) to authenticated;

do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'anular_venta') <> 1 then
    raise exception 'Quedo mas de una version de anular_venta: una llamada de 3 argumentos seria ambigua.';
  end if;

  -- Si algun cobro tuviera la base en cero con bruto positivo, este cambio
  -- devolveria de menos. Estaba verificado antes de aplicar; el guard lo deja
  -- clavado por si alguien inserta cobros por otro camino.
  if exists (
    select 1 from public.venta_pagos
     where tipo_movimiento = 'PAGO_VENTA'
       and coalesce(monto_base, 0) = 0
       and monto_bruto > 0
  ) then
    raise exception 'Hay cobros con monto_base en cero: anular devolveria de menos.';
  end if;
end $$;

commit;
