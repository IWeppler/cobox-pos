-- ---------------------------------------------------------------------------
-- `composicion_ticket`: de qué está hecho un ticket, y cuánto vale agrandarlo.
--
-- Tercera señal de Comerz Insights. Nace de una lectura que corrigió Ignacio:
-- yo había tratado el ticket promedio de 1,91 renglones de Evens como un
-- obstáculo estadístico —es cierto que con 187 tickets multi-item en 30 días
-- no hay base para reglas de asociación— y es ADEMÁS el KPI más accionable que
-- tiene el negocio. Son dos lecturas del mismo número y las dos valen.
--
-- Medido antes de escribir esto, Evens 30 días:
--
--   1 renglón   229 tickets (55,6%)   $24.526 promedio   $11.390 de margen
--   2 renglones  93 tickets (22,6%)   $39.389            $18.797
--   3 renglones  47 tickets (11,4%)   $48.178            $23.417
--
-- Más de la mitad de los tickets son de una sola prenda, con el stock ya
-- adentro del local.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA SEÑAL NO DICE, Y HAY QUE CUIDAR QUE LA UI TAMPOCO LO DIGA
--
-- `brecha_1_a_2` es la diferencia entre el promedio de los tickets de dos
-- renglones y el de los de uno. Es DESCRIPTIVA, no causal: los tickets de dos
-- renglones no son los mismos clientes que los de uno, así que la brecha no
-- es "lo que ganás por cada ticket que convertís". Un cliente que entró a
-- comprar una sola remera y se va con una sola remera no se transforma en el
-- que entró a comprar un conjunto.
--
-- Por eso el campo se llama `brecha` y no `oportunidad` ni `ganancia
-- potencial`: el nombre es la mitad de la honestidad de una señal. Sirve como
-- ORDEN DE MAGNITUD para decidir si vale la pena trabajar el tema, y como
-- LÍNEA DE BASE contra la cual comparar el mes que viene — que es el cierre
-- que hace que Insights rinda cuentas en vez de solo opinar.
--
-- Lo que SÍ es causal y medible es el movimiento de la distribución en el
-- tiempo: si el mes que viene los tickets de un renglón bajan de 55,6% a 50%,
-- eso pasó de verdad.
--
-- Qué se ofrecer NO lo decide el sistema: con 187 tickets multi-item el par
-- más frecuente aparece 3 o 4 veces, que es ruido. La vendedora sabe mejor.
-- La señal pone el objetivo y el número; el complemento lo elige la persona.
-- Cuando haya 6 meses de tickets se podrá revisar.
--
-- Se cortan las ventas ANULADAS y los renglones van × cantidad, igual que en
-- `margen_realizado`: las columnas de `ventas_items` son UNITARIAS.
-- ---------------------------------------------------------------------------
create or replace function public.composicion_ticket(
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
  if not public.tiene_permiso('caja.ver_gerencial') then
    raise exception 'No tenés permiso para ver la composición del ticket'
      using errcode = '42501';
  end if;

  v_negocio := security.current_negocio_id();
  if v_negocio is null then
    raise exception 'No hay un negocio activo' using errcode = '42501';
  end if;

  v_hoy := (now() at time zone v_tz)::date;

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

  with tickets as (
    select
      v.id,
      count(i.id)                                             as renglones,
      sum(i.cantidad)                                         as unidades,
      sum(i.precio_final * i.cantidad)                        as ingreso,
      sum((i.precio_final - i.precio_costo) * i.cantidad)     as margen
    from public.ventas v
    join public.ventas_items i on i.venta_id = v.id
    where v.negocio_id = v_negocio
      and v.estado_operacion is distinct from 'ANULADA'
      and (v.fecha_venta at time zone v_tz)::date between v_desde and v_hasta
    group by v.id
  ),
  -- Los tramos largos se agrupan en "6 o más": con 187 tickets multi-item,
  -- una fila por cada valor hasta 14 son filas de un ticket cada una, que se
  -- leen como si fueran un patrón.
  tramos as (
    select
      least(renglones, 6)                                as tramo,
      count(*)                                           as tickets,
      avg(ingreso)                                       as ticket_prom,
      avg(margen)                                        as margen_prom,
      avg(unidades)                                      as unidades_prom,
      sum(ingreso)                                       as ingreso_total
    from tickets
    group by least(renglones, 6)
  ),
  totales as (
    select
      count(*)         as tickets,
      avg(renglones)   as renglones_prom,
      avg(unidades)    as unidades_prom,
      avg(ingreso)     as ticket_prom,
      avg(margen)      as margen_prom,
      sum(ingreso)     as ingreso_total,
      sum(margen)      as margen_total
    from tickets
  ),
  uno as (select * from tramos where tramo = 1),
  dos as (select * from tramos where tramo = 2)
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'periodo', p_periodo,
    'generado_en', now(),

    'totales', (
      select jsonb_build_object(
        'tickets', t.tickets,
        'renglones_promedio', round(coalesce(t.renglones_prom, 0), 2),
        'unidades_promedio', round(coalesce(t.unidades_prom, 0), 2),
        'ticket_promedio', round(coalesce(t.ticket_prom, 0), 2),
        'margen_promedio', round(coalesce(t.margen_prom, 0), 2),
        'ingreso_total', round(coalesce(t.ingreso_total, 0), 2),
        'margen_total', round(coalesce(t.margen_total, 0), 2)
      )
      from totales t
    ),

    'distribucion', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'renglones', tramo,
        -- El último tramo es abierto: la UI tiene que rotularlo "6 o más".
        'es_tramo_abierto', tramo = 6,
        'tickets', tickets,
        'pct_tickets', round(tickets * 100.0 / nullif((select tickets from totales), 0), 2),
        'ticket_promedio', round(ticket_prom, 2),
        'margen_promedio', round(margen_prom, 2),
        'unidades_promedio', round(unidades_prom, 2),
        'ingreso_total', round(ingreso_total, 2)
      ) order by tramo), '[]'::jsonb)
      from tramos
    ),

    -- DESCRIPTIVO, no causal. Ver la cabecera del archivo antes de rotular
    -- esto como una oportunidad en la UI.
    'brecha_1_a_2', (
      select jsonb_build_object(
        'tickets_de_un_renglon', u.tickets,
        'pct_de_un_renglon', round(u.tickets * 100.0 / nullif((select tickets from totales), 0), 2),
        'ticket_promedio_1', round(u.ticket_prom, 2),
        'ticket_promedio_2', round(d.ticket_prom, 2),
        'diferencia_ticket', round(d.ticket_prom - u.ticket_prom, 2),
        'diferencia_margen', round(d.margen_prom - u.margen_prom, 2),
        'es_descriptiva', true
      )
      from uno u, dos d
    )
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.composicion_ticket(date, date, text) from public;
grant execute on function public.composicion_ticket(date, date, text) to authenticated;

comment on function public.composicion_ticket(date, date, text) is
  'Comerz Insights: distribución de tickets por cantidad de renglones, con ticket y margen promedio de cada tramo. `brecha_1_a_2` es DESCRIPTIVA, no causal: los tickets de dos renglones no son los mismos clientes que los de uno. Gate: caja.ver_gerencial.';
