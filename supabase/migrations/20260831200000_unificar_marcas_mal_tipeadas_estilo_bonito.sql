-- ---------------------------------------------------------------------------
-- Estilo Bonito: tres marcas que eran la misma escrita de dos formas.
--
-- `20260831190000` unificó la ESCRITURA (mayúsculas) y dejó a la vista tres
-- pares que no se pueden resolver con una regla, porque no difieren en cómo se
-- escriben sino en cómo se tipearon: hay una letra de diferencia. Cuál es la
-- correcta lo sabe el comercio, y lo dijo:
--
--   Popys  (66 productos)  ->  Poppys      (queda con 76)
--   Ostin  (1)             ->  Ostyn       (queda con 2)
--   Bingo  (1)             ->  Bingo Fuel  (queda con 38)
--
-- La dirección importa y no es la obvia: el nombre correcto es "Poppys" aunque
-- la forma con una sola P fuera la mayoritaria. Una migración que unificara
-- "por la más usada" habría dejado 76 productos con el nombre mal.
--
-- Se compara en minúsculas aunque a esta altura las marcas ya estén
-- canonicalizadas: si alguien carga "POPYS" entre que esto se escribe y se
-- aplica, entra igual.
--
-- Reversible: `respaldos.marcas_estilo_bonito` (la misma tabla de la migración
-- de escritura) guarda el par (id, marca vieja), con el motivo, de cada
-- producto que cambia.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.marcas_estilo_bonito (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  fila      jsonb not null
);

create temp table correcciones_marca (desde text primary key, hacia text not null);
insert into correcciones_marca values
  ('popys', 'Poppys'),
  ('ostin', 'Ostyn'),
  ('bingo', 'Bingo Fuel');

insert into respaldos.marcas_estilo_bonito (fila)
select jsonb_build_object(
         'id', p.id, 'nombre', p.nombre, 'marca', p.marca,
         'motivo', 'unificacion_marca_mal_tipeada')
  from public.productos p
  join correcciones_marca c on lower(trim(p.marca)) = c.desde
 where p.negocio_id = '055a0286-a7ff-46f4-9910-ba4941140db6';

update public.productos p
   set marca = c.hacia
  from correcciones_marca c
 where p.negocio_id = '055a0286-a7ff-46f4-9910-ba4941140db6'
   and lower(trim(p.marca)) = c.desde;

drop table correcciones_marca;
