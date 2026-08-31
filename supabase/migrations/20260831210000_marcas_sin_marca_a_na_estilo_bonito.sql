-- ---------------------------------------------------------------------------
-- Estilo Bonito: las tres formas de decir "sin marca" quedan en una.
--
--   N/a     (4 productos)  ->  Na
--   Varias  (4)            ->  Na       (queda con 16)
--
-- Son marcadores, no marcas: nadie vende una prenda "Varias". Con tres formas,
-- el combobox ofrece tres opciones para lo mismo y el catálogo se sigue
-- ensuciando solo.
--
-- QUEDA COMO TEXTO Y NO EN NULL, que es lo que pidió el comercio. La
-- diferencia no es cosmética: `Na` es "lo miramos y no tiene marca" y NULL es
-- "nadie lo cargó todavía". Con el valor puesto, los 16 dejan de aparecer
-- mezclados con los productos a los que sí les falta cargar la marca. El costo
-- es que "Na" aparece en el combobox como una marca más; si algún día se
-- prefiere el vacío, es un update de una línea sobre estos mismos 16.
--
-- Reversible: `respaldos.marcas_estilo_bonito`, con su propio motivo.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.marcas_estilo_bonito (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  fila      jsonb not null
);

insert into respaldos.marcas_estilo_bonito (fila)
select jsonb_build_object(
         'id', p.id, 'nombre', p.nombre, 'marca', p.marca,
         'motivo', 'unificacion_sin_marca')
  from public.productos p
 where p.negocio_id = '055a0286-a7ff-46f4-9910-ba4941140db6'
   and lower(trim(coalesce(p.marca, ''))) in ('n/a', 'varias')
   and p.marca is distinct from 'Na';

update public.productos p
   set marca = 'Na'
 where p.negocio_id = '055a0286-a7ff-46f4-9910-ba4941140db6'
   and lower(trim(coalesce(p.marca, ''))) in ('n/a', 'varias')
   and p.marca is distinct from 'Na';
