-- ---------------------------------------------------------------------------
-- `rentabilidad_por_metodo`: qué rinde cada forma de cobrar.
--
-- Es la primera señal de Comerz Insights que sale de acá, y responde una
-- pregunta que hoy nadie puede contestar: ¿me conviene fiar al 15% o cobrar
-- con tarjeta al 15%?
--
-- Dos porcentajes que NO son lo mismo y que acá por fin se ven juntos:
-- `recargo` es lo que el comercio le suma al cliente; `comision` es lo que le
-- retiene el procesador. Igualarlos NO empata, y esa es la primera cosa que
-- la función deja ver: la comisión se cobra sobre el BRUTO (base + recargo) y
-- el recargo se calcula sobre la BASE, así que con 15% y 15% sobre una base
-- de 100 el bruto es 115, la comisión 17,25 y el neto 97,75. Se pierde 2,25%
-- con los dos números iguales. En Evens, medido antes de escribir esto: las
-- tarjetas movieron $1.121.500 de base y dejaron $1.015.941 netos.
--
-- LOS MEDIOS NO SON HOMOGÉNEOS y la función no finge que lo sean:
--
--   * Efectivo, transferencia y tarjeta salen de `venta_pagos`, que es plata
--     que YA entró (o que entra en `dias_acreditacion`).
--   * Cuenta corriente sale de `cuenta_corriente_movimientos`, y NO es plata
--     que entró: es plata prestada. Por eso su fila trae `pendiente_foto` y
--     `vencido_foto`, que las demás no tienen, y por eso el neto de CC es
--     DEVENGADO, no cobrado. Mezclarlos en un solo ranking sin decirlo sería
--     el mismo error que sumar efectivo con tarjetas a 20 días.
--
-- Detalle que importa y que estaba invisible: la comisión de cobrar una deuda
-- de cuenta corriente con tarjeta se le imputa a CUENTA CORRIENTE, no a la
-- tarjeta. Es un costo de haber fiado — sin el fiado ese cobro no existía.
-- Son las filas `tipo_movimiento = 'PAGO_CUENTA_CORRIENTE'`, que hoy suman en
-- el arqueo pero no se le cargan a nadie.
--
-- Lo que la función NO dice, a propósito:
--
--   * Días REALES hasta cobrar el fiado. Los pagos de cuenta corriente no
--     están imputados a una venta (ver `anular_venta`), así que la base no
--     sabe qué ticket saldó cada pago. Se devuelve `dias_plazo_pactado`, que
--     es lo que se prometió, y el nombre lo dice.
--   * Incobrabilidad. Con 5 semanas de historia no hay una sola deuda lo
--     bastante vieja como para llamarla incobrable. `vencido_foto` es un
--     hecho; "incobrable" sería un juicio.
--
-- Las dos fotos son FOTOS DE AHORA y no respetan el período — mismo criterio
-- que `posicion_dinero`, y por el mismo motivo: el saldo de un cliente no
-- tiene versión "de julio".
-- ---------------------------------------------------------------------------
create or replace function public.rentabilidad_por_metodo(
  p_desde   date default null,
  p_hasta   date default null,
  p_periodo text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, security, pg_temp
as $$
declare
  v_tz      constant text := 'America/Argentina/Buenos_Aires';
  v_negocio uuid;
  v_hoy     date;
  v_desde   date;
  v_hasta   date;
  v_out     jsonb;
begin
  -- Mismo gate que posicion_dinero: esto es plata agregada del negocio.
  if not public.tiene_permiso('caja.ver_gerencial') then
    raise exception 'No tenés permiso para ver la rentabilidad por método'
      using errcode = '42501';
  end if;

  v_negocio := security.current_negocio_id();
  if v_negocio is null then
    raise exception 'No hay un negocio activo' using errcode = '42501';
  end if;

  v_hoy := (now() at time zone v_tz)::date;

  -- El rango lo resuelve la BASE, no el cliente: el navegador de la dueña
  -- puede estar en otro huso y partiría el mes por la mitad. Misma semántica
  -- que resolverRangoActual (shared/lib/periodo-ranges.ts).
  if p_periodo is not null then
    v_hasta := v_hoy;
    v_desde := case p_periodo
      when 'hoy'    then v_hoy
      when 'semana' then (date_trunc('week',  v_hoy)::date)
      when 'mes'    then (date_trunc('month', v_hoy)::date)
      when 'anio'   then (date_trunc('year',  v_hoy)::date)
      else v_hoy
    end;
  else
    v_hasta := coalesce(p_hasta, v_hoy);
    v_desde := coalesce(p_desde, v_hasta - 29);
  end if;

  with
  -- --- Medios que cobran de verdad -----------------------------------------
  pagos as (
    select vp.*
      from public.venta_pagos vp
     where vp.negocio_id = v_negocio
       and vp.estado_pago_operacion <> 'ANULADO'
       and (vp.creado_en at time zone v_tz)::date between v_desde and v_hasta
  ),
  directos as (
    select
      vp.metodo_nombre,
      vp.metodo_tipo,
      count(*)                                     as operaciones,
      sum(vp.monto_base)                           as base,
      sum(coalesce(vp.recargo_monto, 0))           as recargo,
      sum(coalesce(vp.comision_monto, 0))          as comision,
      sum(vp.monto_neto)                           as neto,
      -- Ponderado por plata, no por operación: una tarjeta a 20 días con un
      -- ticket grande pesa más que tres cobros chicos a 0 días.
      case when sum(vp.monto_bruto) > 0
           then sum(coalesce(vp.acreditacion_dias, 0) * vp.monto_bruto) / sum(vp.monto_bruto)
      end                                          as dias_acreditacion
    from pagos vp
    where vp.tipo_movimiento = 'PAGO_VENTA'
    group by vp.metodo_nombre, vp.metodo_tipo
  ),
  -- --- Costo de cobrar el fiado, que es costo DEL fiado ---------------------
  costo_cobranza_cc as (
    select
      coalesce(sum(coalesce(vp.comision_monto, 0)), 0) as comision,
      coalesce(sum(vp.monto_bruto), 0)                 as cobrado,
      count(*)                                         as operaciones
    from pagos vp
    where vp.tipo_movimiento = 'PAGO_CUENTA_CORRIENTE'
  ),
  -- --- Fiado otorgado en el período ----------------------------------------
  fiado as (
    select
      count(*)                                             as operaciones,
      coalesce(sum(m.monto - coalesce(m.monto_recargo, 0)), 0) as base,
      coalesce(sum(coalesce(m.monto_recargo, 0)), 0)       as recargo,
      -- null si NINGUNA fila del período tiene el dato: es distinto de 0.
      count(*) filter (where m.recargo_porcentaje is null)  as sin_dato_recargo
    from public.cuenta_corriente_movimientos m
    where m.negocio_id = v_negocio
      and m.tipo = 'DEBITO'
      and coalesce(m.anulado, false) = false
      and (m.creado_en at time zone v_tz)::date between v_desde and v_hasta
  ),
  deuda_foto as (
    select
      coalesce(sum(c.saldo_pendiente), 0)                                    as pendiente,
      coalesce(sum(c.saldo_pendiente) filter (
        where c.fecha_vencimiento_deuda < v_hoy), 0)                         as vencido,
      count(*) filter (where coalesce(c.saldo_pendiente, 0) > 0)             as clientes,
      count(*) filter (where coalesce(c.saldo_pendiente, 0) > 0
                         and c.fecha_vencimiento_deuda < v_hoy)              as clientes_vencidos
    from public.clientes c
    where c.negocio_id = v_negocio
      and coalesce(c.saldo_pendiente, 0) > 0
  ),
  plazo as (
    select coalesce(cc_plazo_mora, 30) as dias
      from public.configuracion_pos
     where negocio_id = v_negocio
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'periodo', p_periodo,
    'generado_en', now(),
    -- Medios que efectivamente cobran. `rendimiento_pct` es lo que queda
    -- después de sumar el recargo y restar la comisión, sobre la base: es el
    -- número que hace comparables un efectivo (0%) y una tarjeta con 15/15
    -- (negativo).
    'medios', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'medio', metodo_nombre,
        'tipo', metodo_tipo,
        'operaciones', operaciones,
        'base', round(base, 2),
        'recargo', round(recargo, 2),
        'comision', round(comision, 2),
        'neto', round(neto, 2),
        'rendimiento_pct', case when base > 0
          then round((recargo - comision) * 100.0 / base, 2) end,
        'dias_acreditacion', round(coalesce(dias_acreditacion, 0), 1),
        'es_credito', false
      ) order by base desc), '[]'::jsonb)
      from directos
    ),
    -- Cuenta corriente va APARTE, no dentro de 'medios'. No es una forma de
    -- cobrar: es una forma de no cobrar todavía, y ponerla en el mismo
    -- ranking invita a leer su rendimiento como si fuera plata en la mano.
    'cuenta_corriente', (
      select jsonb_build_object(
        'operaciones', f.operaciones,
        'base', round(f.base, 2),
        'recargo', round(f.recargo, 2),
        'comision_de_cobranza', round(c.comision, 2),
        'neto_devengado', round(f.base + f.recargo - c.comision, 2),
        'rendimiento_pct', case when f.base > 0
          then round((f.recargo - c.comision) * 100.0 / f.base, 2) end,
        'cobrado_en_periodo', round(c.cobrado, 2),
        'cobranzas', c.operaciones,
        'dias_plazo_pactado', (select dias from plazo),
        -- Fotos de AHORA, no del período. El título tiene que decirlo.
        'pendiente_foto', round(d.pendiente, 2),
        'vencido_foto', round(d.vencido, 2),
        'clientes_foto', d.clientes,
        'clientes_vencidos_foto', d.clientes_vencidos,
        -- Cuántas ventas fiadas del período no tienen el recargo registrado.
        -- Con > 0, `recargo` está subestimado y la tarjeta de Insights tiene
        -- que decirlo en vez de mostrar un número que parece completo.
        'sin_dato_recargo', f.sin_dato_recargo,
        'es_credito', true
      )
      from fiado f, costo_cobranza_cc c, deuda_foto d
    )
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.rentabilidad_por_metodo(date, date, text) from public;
grant execute on function public.rentabilidad_por_metodo(date, date, text) to authenticated;

comment on function public.rentabilidad_por_metodo(date, date, text) is
  'Comerz Insights: rendimiento de cada forma de cobrar (recargo cobrado menos comisión pagada, sobre la base). Cuenta corriente va aparte porque es crédito, no cobro, y su neto es devengado. Gate: caja.ver_gerencial.';
