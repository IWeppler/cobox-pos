-- Backfill de `ventas_items.variante_id` por CONJUNTO de atributos.
--
-- ───────────────────────────────────────────────────────────────────────────
-- QUÉ ESTABA ROTO
--
-- Anular una venta devuelve el stock por `ventas_items.variante_id`, congelado
-- al vender. Cuando falta, `cancel-sale.ts` cae a buscar la variante por
-- `nombre_display` — y ese respaldo NO ACIERTA NUNCA: 79 de 79 en Evens.
-- El renglón queda en `itemsSinRestaurar` y la mercadería vuelve al local sin
-- sumarse al inventario.
--
-- El motivo del 0 de 79 no era que las variantes no existieran: cambió el
-- ORDEN de los atributos en `nombre_display`.
--
--     vendido:  'Argentina / 12 / Niño'
--     vivo:     'Niño / Argentina / 12'
--
-- Comparando el string, no matchea. Comparando el CONJUNTO de tokens
-- —minúsculas, sin espacios, ordenado— matchea exacto y sin ambigüedad.
--
-- ───────────────────────────────────────────────────────────────────────────
-- EL ESTADO REAL, MEDIDO EN LOS SEIS COMERCIOS
--
--   144 renglones no pueden devolver stock hoy
--    28 se resuelven acá (24 Evens + 4 Estilo Bonito), 0 ambiguos
--   116 quedan sin resolver, y no por falta de esfuerzo:
--        35 tienen `producto_id` en NULL — el renglón no sabe qué se vendió
--         3 apuntan a una variante muerta sin equivalente vivo
--        78 tienen producto vivo pero ninguna variante con esos atributos:
--           el catálogo de ese producto se rehízo de verdad
--
-- Ya se probó recuperarlos por `variantes_fusionadas` (1 fila en toda la base)
-- y por `producto_variantes_auditoria` (4.119 filas, 3.754 con id anterior):
-- CERO de los 144 matchea por ahí. No hay de dónde sacarlos.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LA FUGA YA ESTÁ CERRADA, Y ESO CAMBIA QUÉ ES ESTA MIGRACIÓN
--
-- Renglones rotos por mes en Evens:
--
--     julio        288 renglones,  70 rotos   (24,3%)
--     agosto       872 renglones,  33 rotos    (3,8%)
--     septiembre   118 renglones,   0 rotos
--
-- O sea que esto no arregla un mecanismo que sigue perdiendo: limpia una cola
-- histórica cerrada el 16/8. No hace falta tocar el camino de la venta.
--
-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE NO HACE: NO BORRA LOS IDS MUERTOS
--
-- Sería tentador poner en NULL los `variante_id` que apuntan a una variante que
-- ya no existe, para que "null" signifique uniformemente "no se sabe a dónde
-- devolver". No se hace: ese id es la única evidencia de a qué fila apuntaba el
-- renglón, y este proyecto conserva evidencia (los tombstones de
-- `catalogo_borrados`, la auditoría sin FK dura) justamente porque el dato que
-- se borra no vuelve. Que un id muerto "parezca válido" lo resuelve quien lee,
-- no quien destruye el dato.
--
-- SOLO ESCRIBE DONDE HAY UNA ÚNICA CANDIDATA. Con dos variantes vivas de los
-- mismos atributos no hay forma de saber cuál se vendió, y devolver stock a la
-- equivocada es peor que no devolverlo: el error queda invisible en el
-- inventario. Hoy los ambiguos son cero, pero el `= 1` es la regla, no una
-- observación.

begin;

-- Los atributos de un `nombre_display`, normalizados y ordenados. Es lo único
-- que hace falta para comparar dos nombres que dicen lo mismo en otro orden.
create or replace function pg_temp.tokens_variante(p_nombre text)
returns text[]
language sql
immutable
as $$
  select array_agg(t order by t)
    from unnest(string_to_array(lower(coalesce(p_nombre, '')), '/')) g(t0),
         lateral (select btrim(g.t0) as t) x
   where btrim(g.t0) <> '';
$$;

-- El registro de lo que este backfill tocó.
--
-- Existe por dos motivos, y el rollback es el menos importante. El primero es
-- poder contestar después "¿por qué este renglón de julio tiene variante_id si
-- en julio no se guardaba?" sin tener que deducirlo. El segundo es que un
-- backfill que escribe 28 filas y no deja registro es exactamente lo que este
-- proyecto ya decidió que no vuelve a hacer.
create table if not exists public.backfill_variante_id_20260903 (
  venta_item_id        uuid primary key,
  variante_id_anterior uuid,
  variante_id_nuevo    uuid not null,
  nombre_vendido       text,
  nombre_matcheado     text,
  aplicado_en          timestamptz not null default now()
);

comment on table public.backfill_variante_id_20260903 is
  'Qué renglones de ventas_items recibieron variante_id en el backfill por conjunto de atributos, y cuál tenían antes. Interna: RLS sin ninguna policy, así que la app no la lee. Ver 20260903150000.';

-- RLS ENCENDIDA Y SIN NINGUNA POLICY: deny-by-default para todos los roles de
-- la app. No es un descuido — esta tabla no tiene `negocio_id` y no la
-- necesita, porque nadie la consulta desde el producto. Dejarla sin RLS sería
-- la única tabla del esquema que un negocio puede leer entera, aunque solo
-- tenga ids. La lee quien migra, con service role.
alter table public.backfill_variante_id_20260903 enable row level security;

with rotos as (
  select i.id, i.negocio_id, i.producto_id, i.variante, i.variante_id,
         pg_temp.tokens_variante(i.variante) as tokens
    from public.ventas_items i
   where i.producto_id is not null
     and (i.variante_id is null
          or not exists (select 1 from public.producto_variantes v where v.id = i.variante_id))
),
candidatas as (
  select r.id, r.variante, r.variante_id,
         (select array_agg(v.id) from public.producto_variantes v
           where v.producto_id = r.producto_id
             and v.negocio_id = r.negocio_id
             and pg_temp.tokens_variante(v.nombre_display) = r.tokens) as ids
    from rotos r
   where r.tokens is not null
),
unicas as (
  select c.id, c.variante, c.variante_id, c.ids[1] as elegida
    from candidatas c
   where array_length(c.ids, 1) = 1
),
registradas as (
  insert into public.backfill_variante_id_20260903 (
    venta_item_id, variante_id_anterior, variante_id_nuevo,
    nombre_vendido, nombre_matcheado
  )
  select u.id, u.variante_id, u.elegida, u.variante,
         (select v.nombre_display from public.producto_variantes v where v.id = u.elegida)
    from unicas u
  on conflict (venta_item_id) do nothing
  returning venta_item_id, variante_id_nuevo
)
update public.ventas_items i
   set variante_id = r.variante_id_nuevo
  from registradas r
 where r.venta_item_id = i.id;

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_rotos int;
  v_mal_apuntados int;
begin
  -- Ningún renglón que ESTE backfill tocó puede haber quedado apuntando a una
  -- variante de otro producto o de otro negocio: sería devolverle stock a
  -- mercadería ajena.
  --
  -- El chequeo va acotado a `backfill_variante_id_20260903` y no a toda la
  -- tabla, y eso se descubrió aplicando: la versión global aborta porque HAY
  -- una inconsistencia previa, ajena a esto — un renglón de Estilo Bonito del
  -- 3/8 cuyo `producto_id` quedó en "calza estampada Naranjo" mientras su
  -- `variante_id` apunta a "calza estampada Luciras" (el texto vendido dice
  -- `MARCA: luciras`, así que el producto es el que está mal). Es secuela de
  -- 20260831131956, que separó los productos multimarca. Se reporta aparte: un
  -- backfill no arregla de prepo datos que no vino a tocar.
  select count(*) into v_mal_apuntados
    from public.backfill_variante_id_20260903 b
    join public.ventas_items i on i.id = b.venta_item_id
    join public.producto_variantes v on v.id = i.variante_id
   where v.producto_id is distinct from i.producto_id
      or v.negocio_id is distinct from i.negocio_id;

  if v_mal_apuntados > 0 then
    raise exception 'El backfill dejó % renglones apuntando a una variante de otro producto o negocio.', v_mal_apuntados;
  end if;

  select count(*) into v_rotos
    from public.ventas_items i
   where i.variante_id is null
      or not exists (select 1 from public.producto_variantes v where v.id = i.variante_id);

  -- No es un número mágico: es el techo de lo que quedaba antes de correr
  -- esto. Si después del backfill hay MÁS renglones rotos que antes, algo
  -- rompió algo en vez de arreglarlo.
  if v_rotos > 144 then
    raise exception 'Quedaron % renglones sin variante resoluble, más que los 144 de antes.', v_rotos;
  end if;

  raise notice 'Renglones sin variante resoluble después del backfill: %', v_rotos;
end $$;

commit;
