-- ---------------------------------------------------------------------------
-- `margen_realizado`: cuánto deja lo que efectivamente se vendió.
--
-- Segunda señal de Comerz Insights. Sale de `ventas_items.precio_costo`, que
-- queda congelado por renglón en el momento de la venta: en los últimos 30
-- días de Evens hay 806 renglones y CERO sin costo. Base sobrada y hecho
-- verificable — no hay nada que estimar.
--
-- DOS TRAMPAS DE UNIDADES, y son opuestas según el nivel:
--
--   * En la CABECERA, `ventas.precio_costo` es el costo TOTAL de la venta y
--     `ventas.cantidad` son UNIDADES. Ya está documentado en CLAUDE.md porque
--     multiplicarlo otra vez por cantidad hundió el margen de los clientes que
--     más compran.
--   * En el RENGLÓN es al revés: `ventas_items.precio_final`, `precio_costo` y
--     `descuento_monto` son todos UNITARIOS. Verificado contra la cabecera
--     sobre las ventas con líneas de más de una unidad:
--     `ventas.precio_costo = Σ (items.precio_costo × cantidad)`, 12 de 12.
--     Por eso acá todo va × cantidad. Leerlo al revés fue justamente el error
--     del primer backfill de `20260823180630`.
--
-- El descuento NO se resta aparte: `precio_final` ya es `precio_unitario −
-- descuento_monto`. Verificado que `ventas_descuentos.monto_descontado` =
-- Σ (items.descuento_monto × cantidad) en las 423 ventas del período, así que
-- restar la cabecera además del renglón lo contaría dos veces.
--
-- Los recargos quedan AFUERA del margen de producto: el de método es del
-- procesador y el de cuenta corriente es el precio de esperar. Ninguno de los
-- dos es mercadería, y meterlos acá inflaría el margen de los productos que
-- casualmente se pagaron con tarjeta.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ DEVUELVE `dispersion_markup`, Y POR QUÉ IMPORTA MÁS QUE EL RANKING
--
-- La promesa clásica de esta señal es "vas a descubrir que tu producto más
-- vendido es el de peor margen". En estos negocios ESO NO EXISTE, y hay que
-- decirlo antes de que alguien lea un ranking de ruido como si fuera un
-- hallazgo:
--
--   Evens          — 842 de 959 renglones (87,8%) tienen costo exactamente
--                    igual a la mitad del precio. 31 markups distintos.
--   Estilo Bonito  — 265 de 273 (97,1%). 6 markups distintos.
--
-- O sea que el precio no es una decisión por producto sino una regla: ×2 sobre
-- el costo. Con markup uniforme, el margen porcentual es el MISMO para todo el
-- catálogo y lo único que lo mueve es el descuento aplicado en el mostrador
-- (50% sin descuento, 44,4% con 10%, 37,5% con 20% — que es exactamente la
-- distribución observada). Ordenar productos por margen porcentual ahí no
-- ordena por rentabilidad: ordena por quién recibió más descuento.
--
-- Por eso la señal devuelve la dispersión y el bloque de descuentos junto con
-- el ranking. Con markup uniforme, la pregunta útil no es QUÉ producto deja
-- menos sino QUÉ DESCUENTOS se están dando, que es donde está toda la
-- variación real. El día que el comercio empiece a fijar precios por producto,
-- el mismo ranking pasa a decir algo — y la dispersión es lo que avisa cuándo.
--
-- `p_min_unidades` (3 por defecto) es el piso para entrar al ranking por
-- margen porcentual: un producto con una sola unidad vendida no tiene un
-- margen, tiene una anécdota. Los que no llegan se cuentan en
-- `base_insuficiente` en vez de desaparecer sin explicación.
-- ---------------------------------------------------------------------------
create or replace function public.margen_realizado(
  p_desde         date    default null,
  p_hasta         date    default null,
  p_periodo       text    default null,
  p_limite        int     default 15,
  p_min_unidades  numeric default 3
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
  v_limite  int := greatest(1, least(coalesce(p_limite, 15), 100));
  v_out     jsonb;
begin
  if not public.tiene_permiso('caja.ver_gerencial') then
    raise exception 'No tenés permiso para ver el margen'
      using errcode = '42501';
  end if;

  v_negocio := security.current_negocio_id();
  if v_negocio is null then
    raise exception 'No hay un negocio activo' using errcode = '42501';
  end if;

  v_hoy := (now() at time zone v_tz)::date;

  -- El rango lo resuelve la BASE, no el cliente: mismo criterio que
  -- posicion_dinero y rentabilidad_por_metodo.
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

  with renglones as (
    select
      i.producto_id,
      i.cantidad,
      i.precio_unitario,
      i.precio_costo,
      -- Todo × cantidad: las columnas del renglón son UNITARIAS.
      i.precio_final    * i.cantidad as ingreso,
      i.precio_costo    * i.cantidad as costo,
      i.descuento_monto * i.cantidad as descuento,
      i.precio_unitario * i.cantidad as ingreso_sin_descuento,
      v.id                           as venta_id
    from public.ventas_items i
    join public.ventas v on v.id = i.venta_id
    where i.negocio_id = v_negocio
      and v.estado_operacion is distinct from 'ANULADA'
      and (v.fecha_venta at time zone v_tz)::date between v_desde and v_hasta
  ),
  por_producto as (
    select
      r.producto_id,
      coalesce(p.nombre, 'Producto eliminado') as producto,
      coalesce(c.nombre, 'Sin categoría')      as categoria,
      sum(r.cantidad)              as unidades,
      count(*)                     as renglones,
      sum(r.ingreso)               as ingreso,
      sum(r.costo)                 as costo,
      sum(r.ingreso) - sum(r.costo) as margen,
      sum(r.descuento)             as descuento
    from renglones r
    left join public.productos  p on p.id = r.producto_id
    left join public.categorias c on c.id = p.categoria_id
    group by r.producto_id, p.nombre, c.nombre
  ),
  -- Un costo en cero no es margen del 100%: es un costo que nadie cargó.
  -- Queda fuera de todo ranking porcentual y se cuenta aparte.
  rankeables as (
    select * from por_producto
     where costo > 0 and unidades >= p_min_unidades
  ),
  totales as (
    select
      coalesce(sum(ingreso), 0)                        as ingreso,
      coalesce(sum(costo), 0)                          as costo,
      coalesce(sum(ingreso) - sum(costo), 0)           as margen,
      coalesce(sum(descuento), 0)                      as descuento,
      coalesce(sum(unidades), 0)                       as unidades,
      coalesce(sum(renglones), 0)                      as renglones,
      count(*)                                         as productos
    from por_producto
  ),
  -- Cuán parecido es el markup entre productos. Es lo que decide si el
  -- ranking por margen porcentual dice algo o es ruido de descuentos.
  markup as (
    select
      count(*)                                                     as renglones_con_costo,
      count(*) filter (where abs(precio_costo * 2 - precio_unitario) <= 1) as renglones_al_doble,
      count(distinct round(precio_unitario / nullif(precio_costo, 0), 2))  as markups_distintos
    from renglones
    where coalesce(precio_costo, 0) > 0
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'periodo', p_periodo,
    'generado_en', now(),
    'min_unidades', p_min_unidades,

    'totales', (
      select jsonb_build_object(
        'ingreso', round(t.ingreso, 2),
        'costo', round(t.costo, 2),
        'margen', round(t.margen, 2),
        'margen_pct', case when t.ingreso > 0
          then round(t.margen * 100.0 / t.ingreso, 2) end,
        'descuento', round(t.descuento, 2),
        'unidades', t.unidades,
        'renglones', t.renglones,
        'productos', t.productos,
        'tickets', (select count(distinct venta_id) from renglones)
      )
      from totales t
    ),

    -- Cuánto se resignó en el mostrador, y qué margen habría habido sin eso.
    -- Con markup uniforme, ACÁ está toda la variación real del margen.
    'descuentos', (
      select jsonb_build_object(
        'monto', round(t.descuento, 2),
        'pct_sobre_ingreso', case when t.ingreso > 0
          then round(t.descuento * 100.0 / t.ingreso, 2) end,
        'tickets_con_descuento', (
          select count(distinct venta_id) from renglones where descuento > 0
        ),
        'margen_pct_sin_descuento', case when (t.ingreso + t.descuento) > 0
          then round((t.margen + t.descuento) * 100.0 / (t.ingreso + t.descuento), 2) end
      )
      from totales t
    ),

    -- Qué tan uniforme es el precio. `uniforme` en true significa que el
    -- ranking por margen porcentual NO distingue productos y la tarjeta tiene
    -- que decirlo en vez de mostrarlo como un hallazgo.
    'dispersion_markup', (
      select jsonb_build_object(
        'renglones_con_costo', m.renglones_con_costo,
        'renglones_al_doble', m.renglones_al_doble,
        'pct_al_doble', case when m.renglones_con_costo > 0
          then round(m.renglones_al_doble * 100.0 / m.renglones_con_costo, 1) end,
        'markups_distintos', m.markups_distintos,
        'uniforme', (
          m.renglones_con_costo > 0
          and m.renglones_al_doble * 100.0 / m.renglones_con_costo >= 80
        )
      )
      from markup m
    ),

    'por_categoria', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'unidades', unidades,
        'productos', productos,
        'ingreso', round(ingreso, 2),
        'costo', round(costo, 2),
        'margen', round(margen, 2),
        'margen_pct', case when ingreso > 0
          then round(margen * 100.0 / ingreso, 2) end
      ) order by margen desc), '[]'::jsonb)
      from (
        select categoria,
               sum(unidades)  as unidades,
               count(*)       as productos,
               sum(ingreso)   as ingreso,
               sum(costo)     as costo,
               sum(margen)    as margen
          from por_producto
         group by categoria
      ) cat
    ),

    -- Los que más se venden, CON su margen al lado: es el cruce que hace la
    -- pregunta interesante, aunque en un catálogo de markup uniforme la
    -- respuesta vaya a ser "todos igual".
    'mas_vendidos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'producto', producto,
        'categoria', categoria,
        'unidades', unidades,
        'ingreso', round(ingreso, 2),
        'margen', round(margen, 2),
        'margen_pct', case when ingreso > 0
          then round(margen * 100.0 / ingreso, 2) end
      ) order by unidades desc, ingreso desc), '[]'::jsonb)
      from (select * from por_producto order by unidades desc, ingreso desc limit v_limite) x
    ),

    -- Los que más plata dejan en total. No es lo mismo que el mejor
    -- porcentaje: un margen del 60% sobre una unidad no paga el alquiler.
    'mayor_margen', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'producto', producto,
        'categoria', categoria,
        'unidades', unidades,
        'ingreso', round(ingreso, 2),
        'margen', round(margen, 2),
        'margen_pct', case when ingreso > 0
          then round(margen * 100.0 / ingreso, 2) end
      ) order by margen desc), '[]'::jsonb)
      from (select * from por_producto order by margen desc limit v_limite) x
    ),

    -- Candidatos a revisar precio, solo entre los que tienen base.
    'menor_margen_pct', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'producto', producto,
        'categoria', categoria,
        'unidades', unidades,
        'ingreso', round(ingreso, 2),
        'margen', round(margen, 2),
        'margen_pct', round(margen * 100.0 / ingreso, 2),
        'descuento', round(descuento, 2)
      ) order by margen / nullif(ingreso, 0)), '[]'::jsonb)
      from (
        select * from rankeables
         where ingreso > 0
         order by margen / nullif(ingreso, 0)
         limit v_limite
      ) x
    ),

    -- Los que quedaron afuera del ranking porcentual, y por qué. Sin esto,
    -- un producto ausente parece un producto que no se vendió.
    'base_insuficiente', (
      select jsonb_build_object(
        'por_pocas_unidades', (
          select count(*) from por_producto
           where costo > 0 and unidades < p_min_unidades
        ),
        'por_costo_en_cero', (
          select count(*) from por_producto where coalesce(costo, 0) = 0
        )
      )
    )
  )
  into v_out;

  return v_out;
end;
$$;

revoke all on function public.margen_realizado(date, date, text, int, numeric) from public;
grant execute on function public.margen_realizado(date, date, text, int, numeric) to authenticated;

comment on function public.margen_realizado(date, date, text, int, numeric) is
  'Comerz Insights: margen de lo vendido, por producto y por categoría. Las columnas de ventas_items son UNITARIAS y acá van todas × cantidad. Devuelve dispersion_markup porque con precios al doble del costo el ranking por margen porcentual ordena por descuento, no por rentabilidad. Gate: caja.ver_gerencial.';
