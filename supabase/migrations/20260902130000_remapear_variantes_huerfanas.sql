-- Repunta a su variante actual las referencias que quedaron huérfanas por el
-- borrado+reinserción, ahora que 20260902110000 dejó de producir huérfanas
-- nuevas.
--
-- QUÉ ARREGLA. Hasta ayer cada guardado de producto destruía los UUID de sus
-- variantes, y las tablas que los referencian SIN FK quedaban apuntando a la
-- nada, sin error y sin log. Al momento de escribir esto:
--
--   ventas_items       174 renglones apuntan a un id muerto
--   movimientos_stock  441 filas
--
-- El de `ventas_items` es el que importa: esa columna existe desde
-- 20260816130000 para que anular una venta devuelva el stock POR ID. Con el id
-- muerto, la anulación devuelve el stock a ningún lado.
--
-- DE DÓNDE SALE EL MAPA VIEJO->NUEVO. De `producto_variantes_auditoria`: cada
-- guardado dejaba una fila 'ACTUALIZADA' con `variante_id_anterior` y
-- `variante_id_nueva`, que es exactamente "esta fila reemplazó a aquella". Son
-- 3.277 pares, y encadenados transitivamente (un producto editado diez veces
-- son diez saltos) dan 3.068 mapeos, 3.045 de los cuales llegan a una variante
-- que hoy existe. Profundidad máxima observada: 10 saltos.
--
-- ES UNA VENTANA QUE SE CIERRA, y por eso este paso va ahora: a partir de
-- 20260902110000 las filas 'ACTUALIZADA' tienen anterior = nueva (es la misma
-- fila), así que la cadena deja de crecer. Lo que no se recupere con este mapa
-- no se recupera después. El `where anterior <> nueva` de abajo es lo que hace
-- que las filas nuevas no ensucien la cadena con auto-referencias.
--
-- TRES GUARDS, y el tercero es el que importa:
--
--   1. El destino tiene que ser una variante VIVA. Una cadena que termina en
--      otro id muerto no sirve de nada.
--   2. El origen no puede ser ambiguo: si dos ramas de la cadena lo llevan a
--      destinos distintos, no se toca. Verificado antes de aplicar: hoy son 0.
--   3. EL DESTINO TIENE QUE SER DEL MISMO PRODUCTO QUE LA FILA QUE SE REPUNTA.
--      La cadena puede cruzar de producto — las migraciones de separación de
--      Estilo Bonito (20260831180000 y hermanas) partieron productos en dos, y
--      quedaron 6 mapeos donde el destino es de otro producto ("calza algodon
--      est. Cocos" apuntando a "est. Luciras", "Conjunto Rustico Bingo fuel" a
--      "Popys"). Ninguno de los 6 tiene filas para repuntar hoy, así que este
--      guard no cambia ningún número — existe para que no las tenga nunca. Un
--      renglón de venta repuntado a la variante de OTRO producto devolvería
--      stock de mercadería que no es, que es peor que no devolverlo.
--
-- CÓMO SE VALIDÓ QUE LA CADENA ATERRIZA BIEN, antes de aplicar. La cadena es
-- estructural (dice "esta fila reemplazó a aquella") así que hace falta un
-- contraste por CONTENIDO, independiente de ella. Se comparó, sobre los 147
-- renglones de venta a repuntar, los `atributos` que la auditoría registró
-- para la variante vieja contra los de la variante destino:
--
--   143 de 147 -> atributos IDÉNTICOS
--     4 de 147 -> difieren solo en atributos que borraron migraciones
--                 conocidas: `Marca`, que pasó al producto en 20260831170000,
--                 y el atributo basura "2", eliminado en 20260831160000. En
--                 los cuatro, Color + Talle + Género coinciden exacto, así que
--                 el destino es inequívoco.
--
-- NO se comparó por `nombre_display`: 109 de 147 "no coinciden" por ahí, y son
-- todos falsos positivos — lo que cambió es el FORMATO del nombre
-- ("Talle: U / Color: NEGRO" pasó a "Negro / U", "Negro / 4/128gb" a
-- "4/128gb / Negro"), no la variante. Es el mismo motivo por el que el match
-- del guardado se hace por atributos normalizados y no por texto.
--
-- LO QUE NO SE TOCA:
--
--   * Las que no resuelven (73 de movimientos_stock, 27 de ventas_items) NO
--     son un fallo del método. Probé una segunda pasada macheando por
--     `atributos_comparables` contra las variantes vivas del mismo producto y
--     resolvió CERO: son variantes dadas de baja de verdad ('ELIMINADA') o de
--     productos borrados. Que queden huérfanas es la respuesta correcta.
--   * `actualizaciones_precio_items`: sus 2.517 filas con `variante_id` en
--     null no se pueden recuperar por ningún lado. Su FK es ON DELETE SET
--     NULL, así que el borrado escribió null encima del id sin dejar rastro de
--     cuál era. Eso está perdido y no hay mapa que lo traiga.
--   * `producto_variantes_auditoria`: es el mapa, no se repunta a sí misma.
--     Sus huérfanas son el registro de lo que se borró y tienen que seguir
--     apuntando a lo que apuntan.
--
-- REVERSIBLE FILA POR FILA. `variantes_remapeo_aplicado` guarda qué fila de
-- qué tabla se tocó y qué id tenía antes — no solo el mapa. Son ~515 filas y
-- una de las tablas es `ventas_items`, así que el rollback tiene que ser
-- exacto y no una reconstrucción. Ver el archivo `_down` hermano.

begin;

-- El mapa, materializado. Se queda en la base: es el registro de la migración
-- y la única copia de una cadena que a partir de ahora no se puede reconstruir.
create table if not exists public.variantes_remapeo (
  variante_id_viejo uuid primary key,
  variante_id_nuevo uuid not null,
  saltos            int  not null,
  resuelto_en       timestamptz not null default now()
);

comment on table public.variantes_remapeo is
  'Mapa viejo->nuevo de UUID de variante, reconstruido desde producto_variantes_auditoria en 20260902130000. La cadena dejó de crecer con el upsert de 20260902110000, así que esta tabla es la única copia.';

-- Qué filas se tocaron, para poder deshacerlo exacto.
create table if not exists public.variantes_remapeo_aplicado (
  id                uuid primary key default gen_random_uuid(),
  tabla             text not null,
  fila_id           uuid not null,
  variante_id_viejo uuid not null,
  variante_id_nuevo uuid not null,
  aplicado_en       timestamptz not null default now()
);

comment on table public.variantes_remapeo_aplicado is
  'Filas concretas repuntadas por 20260902130000, con el id que tenían antes. Existe para que el rollback sea exacto: una de las tablas es ventas_items.';

with recursive salto as (
  -- `anterior <> nueva` deja afuera las filas que escribe el upsert nuevo, que
  -- son auto-referencias y meterían un ciclo infinito en la recursión.
  select variante_id_anterior as anterior, variante_id_nueva as nueva
    from public.producto_variantes_auditoria
   where accion = 'ACTUALIZADA'
     and variante_id_anterior is not null
     and variante_id_nueva is not null
     and variante_id_anterior <> variante_id_nueva
),
cadena (origen, actual, saltos) as (
  select anterior, nueva, 1 from salto
  union all
  select c.origen, s.nueva, c.saltos + 1
    from cadena c
    join salto s on s.anterior = c.actual
   where c.saltos < 25
),
ultimo as (select origen, max(saltos) as h from cadena group by origen),
finales as (
  select distinct c.origen, c.actual, c.saltos
    from cadena c join ultimo u on u.origen = c.origen and u.h = c.saltos
),
sin_ambiguedad as (
  -- Guard 2. Un origen con dos destinos al mismo nivel no se puede resolver
  -- sin adivinar, así que no se resuelve.
  select f.* from finales f
   where f.origen in (select origen from finales group by origen having count(distinct actual) = 1)
)
insert into public.variantes_remapeo (variante_id_viejo, variante_id_nuevo, saltos)
select s.origen, s.actual, s.saltos
  from sin_ambiguedad s
 where exists (select 1 from public.producto_variantes v where v.id = s.actual)  -- guard 1
   and not exists (select 1 from public.producto_variantes v where v.id = s.origen)
on conflict (variante_id_viejo) do nothing;

-- Guard 3 va en el JOIN de cada UPDATE: el destino tiene que pertenecer al
-- mismo producto que la fila que se está repuntando. Se compara contra el
-- `producto_id` de la PROPIA fila, no contra la auditoría: es el dato que
-- viaja con lo que se quiere arreglar.

insert into public.variantes_remapeo_aplicado (tabla, fila_id, variante_id_viejo, variante_id_nuevo)
select 'movimientos_stock', m.id, m.variante_id, r.variante_id_nuevo
  from public.movimientos_stock m
  join public.variantes_remapeo r on r.variante_id_viejo = m.variante_id
  join public.producto_variantes v on v.id = r.variante_id_nuevo
 where v.producto_id is not distinct from m.producto_id;

update public.movimientos_stock m
   set variante_id = a.variante_id_nuevo
  from public.variantes_remapeo_aplicado a
 where a.tabla = 'movimientos_stock' and a.fila_id = m.id;

insert into public.variantes_remapeo_aplicado (tabla, fila_id, variante_id_viejo, variante_id_nuevo)
select 'ventas_items', i.id, i.variante_id, r.variante_id_nuevo
  from public.ventas_items i
  join public.variantes_remapeo r on r.variante_id_viejo = i.variante_id
  join public.producto_variantes v on v.id = r.variante_id_nuevo
 where v.producto_id is not distinct from i.producto_id;

update public.ventas_items i
   set variante_id = a.variante_id_nuevo
  from public.variantes_remapeo_aplicado a
 where a.tabla = 'ventas_items' and a.fila_id = i.id;

-- Guard final. Si algo repuntó a una variante muerta o de otro producto, la
-- transacción se cae entera antes de commitear.
do $$
declare
  v_muertas int;
  v_cruzadas int;
begin
  select count(*) into v_muertas
    from public.variantes_remapeo_aplicado a
   where not exists (select 1 from public.producto_variantes v where v.id = a.variante_id_nuevo);

  if v_muertas > 0 then
    raise exception 'El remapeo dejó % filas apuntando a una variante inexistente.', v_muertas;
  end if;

  select count(*) into v_cruzadas
    from public.variantes_remapeo_aplicado a
    join public.producto_variantes v on v.id = a.variante_id_nuevo
    left join public.ventas_items i
      on a.tabla = 'ventas_items' and i.id = a.fila_id
    left join public.movimientos_stock m
      on a.tabla = 'movimientos_stock' and m.id = a.fila_id
   where v.producto_id is distinct from coalesce(i.producto_id, m.producto_id);

  if v_cruzadas > 0 then
    raise exception 'El remapeo cruzó de producto en % filas.', v_cruzadas;
  end if;
end $$;

commit;
