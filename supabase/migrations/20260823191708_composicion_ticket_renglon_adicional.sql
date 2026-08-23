-- ---------------------------------------------------------------------------
-- `composicion_ticket`: el número que se puede PROMETER, y el corte por
-- vendedora.
--
-- POR QUÉ SE REESCRIBE. La versión de `20260823185658` devolvía `brecha_1_a_2`
-- —la diferencia entre el ticket promedio de dos renglones y el de uno— con la
-- advertencia de que era descriptiva. La advertencia no alcanza: si el único
-- número grande que devuelve la señal es ese, alguien lo va a usar para
-- proyectar, por más `es_descriptiva: true` que tenga al lado.
--
-- El problema de fondo, planteado por Ignacio: esa brecha es la diferencia
-- entre DOS POBLACIONES DISTINTAS de clientas —las que venían a comprar una
-- cosa y las que venían a comprar varias— no el valor de una palanca. Convertir
-- un ticket de uno a dos no rinde el promedio: rinde el precio de la SEGUNDA
-- PRENDA, que es la que se agrega, y que probablemente sea la más barata del
-- ticket.
--
-- Entonces se agrega `renglon_adicional`, que es el número honesto: cuánto
-- vale, en plata y en margen, la prenda MÁS BARATA de los tickets de dos
-- renglones. Esa es la que se suma cuando la conversión ocurre.
--
-- Medido en Evens, 30 días:
--
--   brecha_1_a_2 (correlacional)   $14.810 de ticket / $7.375 de margen
--   renglón adicional (honesto)    $14.285 de ticket / $6.821 de margen
--
-- Los dos números quedan cerca, y eso NO invalida la corrección: quedan cerca
-- por un motivo empírico de este dataset —la prenda cara de un ticket de dos
-- ($25.307 promedio) se parece mucho al ticket de uno ($24.605)— y ese motivo
-- puede dejar de valer el mes que viene o en otro comercio. El número que se
-- promete tiene que ser el que se cumple por construcción, no el que
-- casualmente coincide.
--
-- Si el módulo promete $170.000 y entrega $60.000, se perdió la confianza
-- aunque los $60.000 sean excelentes.
--
-- ---------------------------------------------------------------------------
-- QUÉ SE VENDE JUNTO A QUÉ: MEDIDO, Y NO ALCANZA
--
-- Se evaluó agregar "lo que más se vende junto a cada producto". No se
-- construye, y no es por prudencia sino por medición. Evens, 90 días:
--
--   Por PRODUCTO    654 pares distintos. El par más frecuente aparece
--                   DOS veces. Cero pares con 3 o más.
--   Por CATEGORÍA   el par más frecuente aparece 7 veces.
--
-- Contra el piso de ~30 co-ocurrencias que hace falta para que un par no sea
-- azar, no hay señal en ningún grano. Una lista de "se llevan juntos" armada
-- con pares de 2 apariciones es una lista de coincidencias, y pegarla atrás
-- del mostrador es peor que no tener nada.
--
-- Se revisa cuando haya ~6 meses. Mientras tanto la señal pone el OBJETIVO
-- (56,9% de tickets de una prenda) y el VALOR ($6.821 de margen por
-- conversión); qué ofrecer lo elige la vendedora, que lo sabe mejor.
--
-- (Nota al margen que apareció midiendo: entre los pares de categorías más
-- frecuentes está "REMERAS, BLUSAS Y CAMISAS" con "REMERAS,BLUSAS Y CAMISAS",
-- que son la MISMA categoría cargada dos veces. El catálogo de Evens tiene
-- varias así —tres variantes de JEANS, dos de CAMPERAS— y eso degrada toda
-- señal agregada por categoría.)
--
-- ---------------------------------------------------------------------------
-- POR VENDEDORA
--
-- Se agrega el corte, con `tickets` siempre al lado para que la base esté
-- declarada. Evens, 30 días: Mara 50,0% de tickets multi-item sobre 80,
-- Evelyn 46,2% sobre 264, Brisa 33,3% sobre 39, Zunilda 27,6% sobre 29.
--
-- Es para coaching, no para castigo, y la diferencia la hace la UI: 29 tickets
-- son pocos y el número tiene que ir con su base a la vista. Mostrar "27,6%"
-- sin el "sobre 29 tickets" convierte una observación en una acusación.
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
      v.vendedor_id,
      count(i.id)                                         as renglones,
      sum(i.cantidad)                                     as unidades,
      sum(i.precio_final * i.cantidad)                    as ingreso,
      sum((i.precio_final - i.precio_costo) * i.cantidad) as margen,
      -- La prenda más barata del ticket: la candidata a ser "la segunda".
      -- Una unidad, no la línea entera — lo que se agrega en una conversión
      -- es un ítem, y `precio_final` ya es unitario.
      min(i.precio_final)                                 as adicional_precio,
      min(i.precio_final - i.precio_costo)                as adicional_margen
    from public.ventas v
    join public.ventas_items i on i.venta_id = v.id
    where v.negocio_id = v_negocio
      and v.estado_operacion is distinct from 'ANULADA'
      and (v.fecha_venta at time zone v_tz)::date between v_desde and v_hasta
    group by v.id, v.vendedor_id
  ),
  tramos as (
    select
      least(renglones, 6) as tramo,
      count(*)            as tickets,
      avg(ingreso)        as ticket_prom,
      avg(margen)         as margen_prom,
      avg(unidades)       as unidades_prom,
      sum(ingreso)        as ingreso_total
    from tickets
    group by least(renglones, 6)
  ),
  totales as (
    select
      count(*)       as tickets,
      avg(renglones) as renglones_prom,
      avg(unidades)  as unidades_prom,
      avg(ingreso)   as ticket_prom,
      avg(margen)    as margen_prom,
      sum(ingreso)   as ingreso_total,
      sum(margen)    as margen_total
    from tickets
  ),
  adicional as (
    select
      count(*)              as tickets_de_dos,
      avg(adicional_precio) as precio_prom,
      avg(adicional_margen) as margen_prom
    from tickets
    where renglones = 2
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

    -- ESTE es el número que se puede prometer. Lo que se agrega en una
    -- conversión de 1 a 2 es una prenda, y en los tickets de dos la que se
    -- suma es la más barata.
    'renglon_adicional', (
      select jsonb_build_object(
        'base_tickets_de_dos', a.tickets_de_dos,
        'precio_promedio', round(coalesce(a.precio_prom, 0), 2),
        'margen_promedio', round(coalesce(a.margen_prom, 0), 2),
        'tickets_de_un_renglon', u.tickets,
        'pct_de_un_renglon', round(u.tickets * 100.0 / nullif((select tickets from totales), 0), 2),
        -- Cuánto margen aporta convertir el 10% de los tickets de una prenda.
        -- Va con el 10% explícito y no como "potencial": es un escenario
        -- rotulado, no una proyección.
        'margen_si_convierte_10pct', round(coalesce(a.margen_prom, 0) * u.tickets * 0.10, 2)
      )
      from adicional a, uno u
    ),

    -- CORRELACIONAL. Se conserva porque es la línea de base contra la cual
    -- comparar el mes que viene, pero NO es lo que rinde una conversión: ver
    -- `renglon_adicional`. La UI no debería mostrar los dos juntos sin decir
    -- cuál es cuál.
    'brecha_1_a_2', (
      select jsonb_build_object(
        'ticket_promedio_1', round(u.ticket_prom, 2),
        'ticket_promedio_2', round(d.ticket_prom, 2),
        'diferencia_ticket', round(d.ticket_prom - u.ticket_prom, 2),
        'diferencia_margen', round(d.margen_prom - u.margen_prom, 2),
        'es_descriptiva', true,
        'no_usar_para_proyectar', true
      )
      from uno u, dos d
    ),

    -- Para coaching. `tickets` va SIEMPRE al lado del porcentaje: sin la base
    -- a la vista, un 27,6% sobre 29 tickets se lee como una acusación.
    'por_vendedora', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vendedora', vendedora,
        'tickets', tickets,
        'tickets_de_un_renglon', de_uno,
        'pct_multi_item', round((tickets - de_uno) * 100.0 / nullif(tickets, 0), 2),
        'renglones_promedio', round(reng_prom, 2),
        'ticket_promedio', round(ticket_prom, 2)
      ) order by tickets desc), '[]'::jsonb)
      from (
        select
          coalesce(p.nombre, 'Sin identificar') as vendedora,
          count(*)                              as tickets,
          count(*) filter (where t.renglones = 1) as de_uno,
          avg(t.renglones)                      as reng_prom,
          avg(t.ingreso)                        as ticket_prom
        from tickets t
        left join public.perfiles p on p.id = t.vendedor_id
        group by coalesce(p.nombre, 'Sin identificar')
      ) v
    )
  )
  into v_out;

  return v_out;
end;
$$;

comment on function public.composicion_ticket(date, date, text) is
  'Comerz Insights: distribución de tickets por renglones, valor del renglón adicional y corte por vendedora. `renglon_adicional` es el número que se puede prometer (la prenda que se agrega); `brecha_1_a_2` es correlacional y NO sirve para proyectar. Gate: caja.ver_gerencial.';
