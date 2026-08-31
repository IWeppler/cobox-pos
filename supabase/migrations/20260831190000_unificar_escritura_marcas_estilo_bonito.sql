-- ---------------------------------------------------------------------------
-- Estilo Bonito: una sola forma de escribir cada marca.
--
-- QUÉ PASABA. Con la marca ya en `productos.marca` (ver `20260831170000` y
-- `20260831180000`) quedó a la vista que 17 marcas convivían escritas de dos o
-- tres maneras: "popys" y "Popys" (66 productos), "bingo fuel" / "Bingo fuel" /
-- "Bingo Fuel" (37), "Lde" y "LDE" (30). Para el sistema son marcas DISTINTAS:
-- el combobox las ofrece por separado —y así se siguen creando— y cualquier
-- filtro o corte por marca las parte al medio.
--
-- LA REGLA: primera letra de cada palabra en mayúscula, el resto en minúscula.
-- "bingo fuel" queda "Bingo Fuel". Se aplica a TODAS las marcas del negocio y
-- no solo a las que hoy están duplicadas: si la regla vale, vale para la
-- próxima también, y dejar la mitad del catálogo con otra convención garantiza
-- que el problema vuelva.
--
-- POR QUÉ NO `initcap()`: parte también en el apóstrofe, así que "Buddy's" se
-- convierte en "Buddy'S". La función de abajo corta SOLO por espacio.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, a propósito: unificar marcas que difieren en
-- algo más que mayúsculas. "Popys" (66) y "Poppys" (10), "Ostyn" y "Ostin",
-- "Bingo" y "Bingo Fuel" son casi seguro la misma marca mal tipeada, pero eso
-- es una decisión sobre los DATOS —cuál es el nombre correcto— y no una regla
-- de escritura. Lo mismo con "Na", "NA", "N/a" y "varias", que son formas de
-- decir "sin marca". Quedan como están, a la vista, para resolver con el
-- comercio.
--
-- Reversible: `respaldos.marcas_estilo_bonito` guarda el par (id, marca vieja)
-- de cada producto que cambia.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.marcas_estilo_bonito (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  fila      jsonb not null
);

create or replace function public.marca_canonica(p_marca text)
returns text
language sql
immutable
as $fn$
  select nullif(array_to_string(array(
    select upper(left(palabra, 1)) || lower(substr(palabra, 2))
      from unnest(string_to_array(trim(coalesce(p_marca, '')), ' ')) palabra
     where palabra <> ''
  ), ' '), '');
$fn$;

insert into respaldos.marcas_estilo_bonito (fila)
select jsonb_build_object('id', p.id, 'nombre', p.nombre, 'marca', p.marca)
  from public.productos p
 where p.negocio_id = '055a0286-a7ff-46f4-9910-ba4941140db6'
   and coalesce(trim(p.marca), '') <> ''
   and p.marca is distinct from public.marca_canonica(p.marca);

update public.productos p
   set marca = public.marca_canonica(p.marca)
 where p.negocio_id = '055a0286-a7ff-46f4-9910-ba4941140db6'
   and coalesce(trim(p.marca), '') <> ''
   and p.marca is distinct from public.marca_canonica(p.marca);

-- La regla vive en TypeScript (`shared/lib/marca-por-rubro.ts`, que ya
-- canonicaliza contra las marcas existentes al guardar). Esta función era solo
-- para el backfill: dejarla sería una segunda definición de la misma regla, y
-- dos definiciones terminan diciendo cosas distintas.
drop function if exists public.marca_canonica(text);
