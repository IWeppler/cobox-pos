-- ===========================================================================
-- 2. `curva_de_precio`: a qué precio se vendió cada unidad.
--
-- Define el margen real de la temporada, y es la contracara accionable de lo
-- que descubrió `margen_realizado`: con markup uniforme (86,3% de los
-- renglones de Evens al doble del costo), el margen NO varía por producto,
-- varía por descuento. Esta señal es donde vive esa variación.
--
-- Medido en Evens, 60 días: 582 unidades a precio lleno (50,3% de margen),
-- 302 con hasta 10% de descuento (44,7%), 64 con hasta 20% (37,6%), y NINGUNA
-- por encima del 20%. No hay liquidación: hay descuento de mostrador.
--
-- Los tramos se calculan sobre el descuento del RENGLÓN
-- (`descuento_monto / precio_unitario`), no sobre el del ticket: una promo que
-- toca un solo producto no descuenta el ticket entero, y promediar los dos
-- diluye justo lo que se quiere ver.
-- ===========================================================================
create or replace function public.curva_de_precio(
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
    raise exception 'No tenés permiso para ver la curva de precio'
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

  with r as (
    select
      i.cantidad,
      i.precio_final    * i.cantidad                      as ingreso,
      i.descuento_monto * i.cantidad                      as descuento,
      (i.precio_final - i.precio_costo) * i.cantidad      as margen,
      v.vendedor_id,
      case
        when coalesce(i.descuento_monto, 0) <= 0                      then 'PRECIO_LLENO'
        when i.descuento_monto / nullif(i.precio_unitario, 0) <= 0.10 then 'HASTA_10'
        when i.descuento_monto / nullif(i.precio_unitario, 0) <= 0.20 then 'HASTA_20'
        when i.descuento_monto / nullif(i.precio_unitario, 0) <= 0.30 then 'HASTA_30'
        else 'MAS_DE_30'
      end as tramo
    from public.ventas_items i
    join public.ventas v on v.id = i.venta_id
    where i.negocio_id = v_negocio
      and v.estado_operacion is distinct from 'ANULADA'
      and (v.fecha_venta at time zone v_tz)::date between v_desde and v_hasta
  ),
  tot as (
    select sum(cantidad) unidades, sum(ingreso) ingreso,
           sum(descuento) descuento, sum(margen) margen
    from r
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'periodo', p_periodo,
    'generado_en', now(),

    'totales', (
      select jsonb_build_object(
        'unidades', coalesce(t.unidades, 0),
        'ingreso', round(coalesce(t.ingreso, 0), 2),
        'margen', round(coalesce(t.margen, 0), 2),
        'margen_pct', case when t.ingreso > 0 then round(t.margen * 100.0 / t.ingreso, 2) end,
        -- Lo que se resignó en el mostrador, en plata.
        'descuento_resignado', round(coalesce(t.descuento, 0), 2),
        'margen_pct_a_precio_lleno', case when (t.ingreso + t.descuento) > 0
          then round((t.margen + t.descuento) * 100.0 / (t.ingreso + t.descuento), 2) end
      )
      from tot t
    ),

    'tramos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tramo', tramo,
        'unidades', unidades,
        'pct_unidades', round(unidades * 100.0 / nullif((select unidades from tot), 0), 2),
        'ingreso', round(ingreso, 2),
        'margen', round(margen, 2),
        'margen_pct', case when ingreso > 0 then round(margen * 100.0 / ingreso, 2) end,
        'descuento_resignado', round(descuento, 2)
      ) order by orden), '[]'::jsonb)
      from (
        select tramo,
               case tramo when 'PRECIO_LLENO' then 1 when 'HASTA_10' then 2
                          when 'HASTA_20' then 3 when 'HASTA_30' then 4 else 5 end as orden,
               sum(cantidad) unidades, sum(ingreso) ingreso,
               sum(margen) margen, sum(descuento) descuento
        from r group by 1, 2
      ) x
    ),

    -- Quién descuenta cuánto. Con `unidades` al lado, por el mismo motivo que
    -- en `composicion_ticket`: es para coaching, no para castigo.
    'por_vendedora', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vendedora', vendedora,
        'unidades', unidades,
        'unidades_con_descuento', con_desc,
        'pct_unidades_con_descuento', round(con_desc * 100.0 / nullif(unidades, 0), 2),
        'descuento_resignado', round(descuento, 2),
        'descuento_pct_sobre_ingreso', case when ingreso > 0
          then round(descuento * 100.0 / ingreso, 2) end
      ) order by unidades desc), '[]'::jsonb)
      from (
        select coalesce(p.nombre, 'Sin identificar') as vendedora,
               sum(r.cantidad)                        as unidades,
               sum(r.cantidad) filter (where r.tramo <> 'PRECIO_LLENO') as con_desc,
               sum(r.descuento)                       as descuento,
               sum(r.ingreso)                         as ingreso
        from r left join public.perfiles p on p.id = r.vendedor_id
        group by coalesce(p.nombre, 'Sin identificar')
      ) v
    )
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.curva_de_precio(date, date, text) from public;
grant execute on function public.curva_de_precio(date, date, text) to authenticated;

comment on function public.curva_de_precio(date, date, text) is
  'Comerz Insights: a qué precio se vendió cada unidad (lleno / con descuento por tramo), con el margen de cada tramo y el corte por vendedora. Con markup uniforme, acá vive toda la variación real del margen. Gate: caja.ver_gerencial.';


