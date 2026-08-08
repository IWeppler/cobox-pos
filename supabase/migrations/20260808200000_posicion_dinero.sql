-- Posición de dinero: "cuánto tengo en cada caja / banco / billetera".
--
-- Es DERIVADA de lo que ya está registrado (turnos, venta_pagos, egresos). No
-- es el saldo del banco: el banco también se mueve por cosas que el POS no
-- ve (una transferencia al proveedor, un débito automático, plata que ya se
-- retiró de la cuenta). Lo que responde es "cuánta plata entró y dónde
-- debería estar", que hoy no lo responde nadie.
--
-- Tres bloques, y son preguntas distintas a propósito:
--
--   efectivo      Plata física AHORA, solo de turnos ABIERTOS. Se calcula
--                 igual que el efectivo esperado del cierre (mismos filtros
--                 que cerrarTurnoAction): monto_inicial + cobros en efectivo
--                 - TODOS los egresos del turno, sin importar el tipo. Si no
--                 coincidiera con el arqueo, una de las dos cuentas está mal.
--   por_acreditar Plata cobrada que todavía NO está en la cuenta. Sale de
--                 acreditacion_dias congelado en el pago. En ClickTostado las
--                 tarjetas son a 20 días: hoy nadie ve cuánto hay en el aire.
--   acreditado    Lo que cayó en cada cuenta DENTRO del período. Esto es
--                 flujo, no saldo.
--
-- Los egresos solo bajan el efectivo porque hoy todo egreso sale del cajón.
-- El día que se registre un pago por transferencia habrá que restarlo de la
-- cuenta correspondiente — es justo lo que va a pedir la conciliación.
--
-- Permiso: el mismo `caja.ver_gerencial` que la Vista Gerencial. La función
-- es SECURITY DEFINER y aborta con 42501, así que el chequeo no depende de
-- que la UI se acuerde de hacerlo.

create or replace function public.posicion_dinero(
  p_desde date default null,
  p_hasta date default null,
  p_periodo text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tz      constant text := 'America/Argentina/Buenos_Aires';
  v_negocio uuid;
  v_hoy     date;
  v_hasta   date;
  v_desde   date;
  v_out     jsonb;
begin
  if not public.tiene_permiso('caja.ver_gerencial') then
    raise exception 'No tenés permiso para ver la posición de dinero'
      using errcode = '42501';
  end if;

  v_negocio := security.current_negocio_id();
  if v_negocio is null then
    raise exception 'No hay un negocio activo' using errcode = '42501';
  end if;

  v_hoy := (now() at time zone v_tz)::date;

  -- El período de calendario lo resuelve la BASE, no el cliente: el navegador
  -- de la dueña puede estar en otro huso y partiría el mes por la mitad.
  -- Misma semántica que resolverRangoActual (shared/lib/periodo-ranges.ts).
  if p_periodo is not null then
    v_hasta := v_hoy;
    v_desde := case p_periodo
      when 'hoy'    then v_hoy
      when 'semana' then (date_trunc('week',  v_hoy)::date)
      when 'mes'    then (date_trunc('month', v_hoy)::date)
      when 'anio'   then (date_trunc('year',  v_hoy)::date)
      -- Fail-closed hacia lo más chico y explicable.
      else v_hoy
    end;
  else
    v_hasta := coalesce(p_hasta, v_hoy);
    v_desde := coalesce(p_desde, v_hasta - 29);
  end if;

  with turnos_abiertos as (
    select t.id, t.monto_inicial, t.fecha_apertura, t.vendedor_id,
           coalesce(p.nombre, 'Sin nombre') as vendedor
      from public.turnos_caja t
      left join public.perfiles p on p.id = t.vendedor_id
     where t.negocio_id = v_negocio
       and t.estado <> 'CERRADO'
  ),
  -- Mismos filtros que el cierre: EFECTIVO y no anulado. Incluye las cobranzas
  -- de cuenta corriente, que también entran al cajón.
  efectivo_turno as (
    select vp.turno_caja_id, sum(vp.monto_bruto) as ingresos
      from public.venta_pagos vp
      join turnos_abiertos t on t.id = vp.turno_caja_id
     where vp.negocio_id = v_negocio
       and vp.metodo_tipo = 'EFECTIVO'
       and vp.estado_pago_operacion <> 'ANULADO'
     group by vp.turno_caja_id
  ),
  -- TODOS los tipos de egreso: los tres sacan plata del cajón.
  egresos_turno as (
    select e.turno_caja_id, sum(e.monto) as salidas
      from public.egresos e
      join turnos_abiertos t on t.id = e.turno_caja_id
     where e.negocio_id = v_negocio
     group by e.turno_caja_id
  ),
  cajas as (
    select t.id,
           t.vendedor,
           t.fecha_apertura,
           t.monto_inicial,
           coalesce(e.ingresos, 0) as ingresos,
           coalesce(g.salidas, 0)  as salidas,
           t.monto_inicial + coalesce(e.ingresos, 0) - coalesce(g.salidas, 0) as esperado
      from turnos_abiertos t
      left join efectivo_turno e on e.turno_caja_id = t.id
      left join egresos_turno  g on g.turno_caja_id = t.id
  ),
  -- Un pago digital con su fecha de acreditación ya resuelta.
  digitales as (
    select vp.metodo_nombre,
           vp.metodo_tipo,
           vp.monto_bruto,
           vp.comision_monto,
           vp.monto_neto,
           (vp.creado_en + (vp.acreditacion_dias || ' days')::interval) as fecha_acreditacion
      from public.venta_pagos vp
     where vp.negocio_id = v_negocio
       and vp.metodo_tipo <> 'EFECTIVO'
       and vp.estado_pago_operacion <> 'ANULADO'
  ),
  pendientes as (
    select metodo_nombre, metodo_tipo,
           count(*)                as cantidad,
           sum(monto_bruto)        as bruto,
           sum(comision_monto)     as comision,
           sum(monto_neto)         as neto,
           min(fecha_acreditacion) as proxima,
           max(fecha_acreditacion) as ultima
      from digitales
     where fecha_acreditacion > now()
     group by metodo_nombre, metodo_tipo
  ),
  acreditados as (
    select metodo_nombre, metodo_tipo,
           count(*)            as cantidad,
           sum(monto_bruto)    as bruto,
           sum(comision_monto) as comision,
           sum(monto_neto)     as neto
      from digitales
     where fecha_acreditacion <= now()
       and (fecha_acreditacion at time zone v_tz)::date between v_desde and v_hasta
     group by metodo_nombre, metodo_tipo
  ),
  efectivo_cerrado as (
    select coalesce(sum(t.monto_declarado), 0) as declarado
      from public.turnos_caja t
     where t.negocio_id = v_negocio
       and t.estado = 'CERRADO'
       and (t.fecha_cierre at time zone v_tz)::date = v_hoy
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'periodo', p_periodo,
    'generado_en', now(),
    'efectivo', jsonb_build_object(
      'total', (select coalesce(sum(esperado), 0) from cajas),
      'turnos_abiertos', (select count(*) from cajas),
      'cerrado_hoy', (select declarado from efectivo_cerrado),
      'cajas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'turno_id', id,
          'vendedor', vendedor,
          'desde', fecha_apertura,
          'inicial', monto_inicial,
          'ingresos', ingresos,
          'salidas', salidas,
          'esperado', esperado
        ) order by esperado desc), '[]'::jsonb)
        from cajas
      )
    ),
    'por_acreditar', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'metodo_nombre', metodo_nombre,
        'metodo_tipo', metodo_tipo,
        'cantidad', cantidad,
        'bruto', bruto,
        'comision', comision,
        'neto', neto,
        'proxima', proxima,
        'ultima', ultima
      ) order by neto desc), '[]'::jsonb)
      from pendientes
    ),
    'acreditado', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'metodo_nombre', metodo_nombre,
        'metodo_tipo', metodo_tipo,
        'cantidad', cantidad,
        'bruto', bruto,
        'comision', comision,
        'neto', neto
      ) order by neto desc), '[]'::jsonb)
      from acreditados
    )
  )
  into v_out;

  return v_out;
end;
$function$;

drop function if exists public.posicion_dinero(date, date);

comment on function public.posicion_dinero(date, date, text) is
  'Posición de dinero DERIVADA de turnos/venta_pagos/egresos: efectivo en cajas abiertas, cobros digitales pendientes de acreditar y acreditados en el período. No es el saldo bancario real.';
