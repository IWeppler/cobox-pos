-- ---------------------------------------------------------------------------
-- Tanda 4 de Comerz Insights: las tres señales que la base ya banca hoy.
--
-- Salen del triaje de una lista más larga. Las que quedaron AFUERA y por qué,
-- para no volver a proponerlas sin resolver primero lo que les falta:
--
--   * Incobrabilidad de cuenta corriente — con 5 semanas de historia no hay
--     una sola deuda lo bastante vieja como para llamarla incobrable. El
--     sustituto correcto es la ANTIGÜEDAD del saldo, que sí es un hecho, y es
--     la tercera función de este archivo.
--   * Días REALES hasta cobrar — los pagos de cuenta corriente no están
--     imputados a una venta, así que la base no sabe qué ticket saldó cada
--     pago (ya documentado en `anular_venta`). Imputarlos es un cambio de
--     schema, no una consulta.
--   * Costo del dinero en el tiempo — es un cálculo barato pero necesita una
--     TASA, y un default inventado acá es peor que no tener la señal: diría
--     con precisión falsa si conviene fiar. Tiene que salir de una
--     configuración que fija el comercio o el contador.
--   * Costo de reposición vs histórico — `producto_variantes.costo` está en
--     cero en 3.020 de 3.153 variantes de Evens. No hay costo actual del
--     catálogo contra el cual comparar.
--   * Sell-through por lote y capital inmovilizado por antigüedad de compra —
--     nada ata una unidad vendida al remito que la trajo. Es un `lote_id` en
--     `ventas_items`, no una consulta.
--   * Ciclo de conversión de efectivo — le falta una de las tres patas: los
--     días de pago a proveedor. `ordenes_compra` guarda remitos, no
--     condiciones de pago. Media métrica cuyo sentido entero está en las tres
--     patas es peor que ninguna.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. `ventas_por_momento`: cuándo se vende.
--
-- Define horarios de personal y cuándo conviene una promo. Es de las señales
-- más baratas de calcular y de las que se explican solas.
--
-- Medido en Evens, 60 días: sábado 159 ventas y viernes 119, contra 30 el
-- lunes. Domingo tiene solo 17 ventas pero el ticket promedio más alto de la
-- semana ($46.791) — dos hechos distintos que la misma tarjeta tiene que
-- mostrar juntos, porque "cerrar los domingos" y "el domingo entra la clienta
-- que más gasta" salen de la misma fila.
--
-- El corte por HORA se devuelve aparte y con su conteo: 488 ventas repartidas
-- en 14 horas y 7 días son celdas de 5 ventas, y una grilla día × hora a ese
-- volumen es un mapa de calor de ruido. Las franjas (mañana / tarde / noche)
-- sí tienen base.
-- ===========================================================================
create or replace function public.ventas_por_momento(
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
    raise exception 'No tenés permiso para ver las ventas por momento'
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
    v_desde := coalesce(p_desde, v_hasta - 59);
  end if;

  with v as (
    select
      v.id,
      v.total,
      (v.fecha_venta at time zone v_tz)                       as local,
      extract(dow  from v.fecha_venta at time zone v_tz)::int as dow,
      extract(hour from v.fecha_venta at time zone v_tz)::int as hora
    from public.ventas v
    where v.negocio_id = v_negocio
      and v.estado_operacion is distinct from 'ANULADA'
      and (v.fecha_venta at time zone v_tz)::date between v_desde and v_hasta
  ),
  -- Cuántos días de cada tipo hubo en el rango: sin esto, comparar un sábado
  -- contra un lunes en un rango de 37 días compara 6 sábados contra 5 lunes y
  -- la diferencia incluye el calendario.
  dias as (
    select extract(dow from d)::int as dow, count(*) as cantidad
    from generate_series(v_desde, v_hasta, interval '1 day') d
    group by 1
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'periodo', p_periodo,
    'generado_en', now(),
    'total_ventas', (select count(*) from v),

    'por_dia_semana', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dow', dow,
        'dia', case dow
          when 0 then 'Domingo' when 1 then 'Lunes'   when 2 then 'Martes'
          when 3 then 'Miércoles' when 4 then 'Jueves' when 5 then 'Viernes'
          else 'Sábado' end,
        'ventas', ventas,
        'dias_en_el_rango', dias_rango,
        'ventas_por_dia', round(ventas::numeric / nullif(dias_rango, 0), 2),
        'ingreso', round(ingreso, 2),
        'ticket_promedio', round(ticket_prom, 2)
      ) order by dow), '[]'::jsonb)
      from (
        select d.dow, coalesce(count(v.id), 0) as ventas, d.cantidad as dias_rango,
               coalesce(sum(v.total), 0) as ingreso, avg(v.total) as ticket_prom
        from dias d left join v on v.dow = d.dow
        group by d.dow, d.cantidad
      ) x
    ),

    'por_franja', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'franja', franja,
        'ventas', ventas,
        'ingreso', round(ingreso, 2),
        'ticket_promedio', round(ticket_prom, 2)
      ) order by orden), '[]'::jsonb)
      from (
        select
          case when hora < 13 then 'MANANA' when hora < 20 then 'TARDE' else 'NOCHE' end as franja,
          case when hora < 13 then 1        when hora < 20 then 2       else 3 end       as orden,
          count(*) as ventas, sum(total) as ingreso, avg(total) as ticket_prom
        from v
        group by 1, 2
      ) f
    ),

    -- Con su conteo al lado: a este volumen una hora suelta puede tener 5
    -- ventas, y la UI tiene que poder decidir si la muestra.
    'por_hora', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'hora', hora,
        'ventas', ventas,
        'ingreso', round(ingreso, 2),
        'ticket_promedio', round(ticket_prom, 2)
      ) order by hora), '[]'::jsonb)
      from (
        select hora, count(*) as ventas, sum(total) as ingreso, avg(total) as ticket_prom
        from v group by hora
      ) h
    )
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.ventas_por_momento(date, date, text) from public;
grant execute on function public.ventas_por_momento(date, date, text) to authenticated;

comment on function public.ventas_por_momento(date, date, text) is
  'Comerz Insights: cuándo se vende. Día de semana (normalizado por cuántos días de cada tipo hubo en el rango), franja y hora. Gate: caja.ver_gerencial.';


