-- ---------------------------------------------------------------------------
-- `categorias.temporada`: el dato que el dueño sabe y el sistema no.
--
-- EL PROBLEMA, planteado por Ignacio con el ejemplo exacto: que Insights no
-- diga "che, necesitamos más camperas" un 15 de septiembre, cuando viene el
-- verano y esa mercadería se va a quedar clavada seis meses.
--
-- La respuesta ortodoxa es "esperá un año de historia y aprendé la
-- estacionalidad de los datos". No sirve acá: el POS tiene 5 semanas, y
-- esperar hasta diciembre de 2027 para poder decir algo sobre temporadas es
-- no decirlo nunca. Un campo cargado a mano UNA VEZ vale más que un año de
-- historia, y se puede tener hoy.
--
-- ---------------------------------------------------------------------------
-- REGLA DE USO, Y ES LA PARTE IMPORTANTE
--
-- La temporada sirve SOLO PARA SILENCIAR, nunca para sugerir.
--
--   * "No me muestres abrigos en la lista de reposición de noviembre" es
--     seguro: el peor caso es que falte una fila.
--   * "Comprá mallas que viene el verano" es una PREDICCIÓN que el sistema no
--     puede respaldar, y del tipo que cuesta plata real si se equivoca.
--
-- La misma asimetría de siempre: una recomendación equivocada cuesta más que
-- diez ausentes.
--
-- El default es TODO_EL_ANIO, o sea que NADA queda silenciado hasta que
-- alguien lo declare a mano. Es deliberado y va contra la costumbre de esta
-- base de ser fail-closed: acá el "cierre" seguro es NO ocultar. Un default
-- que adivinara la temporada de una categoría por su nombre escondería
-- mercadería real sin que nadie lo haya pedido, que es exactamente el sistema
-- que supone en vez de saber. Además el freno principal contra el consejo
-- fuera de temporada no es este campo, sino la VENTANA CORTA de la señal de
-- reposición: si una variante no vendió nada en los últimos 14-21 días no
-- aparece, sin necesidad de saber en qué mes estamos. La temporada es la
-- segunda línea, no la primera.
--
-- ---------------------------------------------------------------------------
-- LAS VENTANAS
--
-- Hemisferio sur, y son ventanas de VENTA, no meteorológicas: la ropa de
-- verano se vende desde octubre, no desde el 21 de diciembre.
--
--   VERANO          oct nov dic ene feb mar
--   INVIERNO        abr may jun jul ago sep
--   MEDIA_ESTACION  mar abr may / sep oct nov
--   TODO_EL_ANIO    siempre
--
-- Se solapan a propósito: en marzo conviven la liquidación de verano y la
-- entrada de media estación, y una ventana que no lo refleje silencia
-- mercadería que sí se está vendiendo.
--
-- El criterio vive en DOS lugares que tienen que decir lo mismo: esta función
-- y `shared/lib/temporada-categoria.ts`, con su test. Mismo patrón que
-- `tipo-egreso.ts` y `recargo-metodo.ts`.
-- ---------------------------------------------------------------------------

alter table public.categorias
  add column if not exists temporada text not null default 'TODO_EL_ANIO';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'categorias_temporada_check'
  ) then
    alter table public.categorias
      add constraint categorias_temporada_check
      check (temporada in ('TODO_EL_ANIO', 'VERANO', 'INVIERNO', 'MEDIA_ESTACION'));
  end if;
end;
$$;

comment on column public.categorias.temporada is
  'Ventana de venta de la categoría, cargada a mano. Se usa SOLO para silenciar sugerencias fuera de temporada, NUNCA para sugerir comprar. Default TODO_EL_ANIO: nada se oculta hasta que alguien lo declare.';

-- ---------------------------------------------------------------------------
-- ¿Esta temporada está vendiéndose en esta fecha?
--
-- IMMUTABLE no: depende de `p_fecha`, pero no de nada externo, así que es
-- STABLE y se puede usar en un WHERE sin sorpresas. Sin `p_fecha` toma hoy en
-- hora argentina — nunca UTC, que a la noche ya es el día siguiente y en el
-- último día del mes cambiaría la ventana.
-- ---------------------------------------------------------------------------
create or replace function public.categoria_en_temporada(
  p_temporada text,
  p_fecha     date default null
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case coalesce(p_temporada, 'TODO_EL_ANIO')
    when 'VERANO'         then extract(month from f.d) in (10, 11, 12, 1, 2, 3)
    when 'INVIERNO'       then extract(month from f.d) in (4, 5, 6, 7, 8, 9)
    when 'MEDIA_ESTACION' then extract(month from f.d) in (3, 4, 5, 9, 10, 11)
    -- TODO_EL_ANIO y cualquier valor inesperado: no silencia nada. El CHECK
    -- ya frena lo que no corresponda al escribir; acá, ante la duda, mostrar.
    else true
  end
  from (select coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date) as d) f;
$$;

comment on function public.categoria_en_temporada(text, date) is
  'Si esa temporada se vende en esa fecha (hemisferio sur, ventanas de VENTA no meteorológicas). Ante cualquier valor inesperado devuelve true: no silenciar es el lado seguro. Espejo de shared/lib/temporada-categoria.ts.';

grant execute on function public.categoria_en_temporada(text, date) to authenticated, anon;
