-- ---------------------------------------------------------------------------
-- Saca "Género" de los atributos de variante, donde nunca tuvo que estar.
--
-- QUÉ ES. En indumentaria el género no es una variante de la prenda: es a
-- QUIÉN está destinada, y eso en este sistema es el nivel de arriba del árbol
-- de categorías (HOMBRE › ZAPATILLAS, NENA › CALZADOS). El código ya lo dice
-- en tres lugares —`columnas-por-rubro.ts` marca género como NO variante,
-- `parse-productos-csv.ts` lo manda a `raw_genero` y no a `atributos`, y
-- `create-purchase.ts` solo lo deja sobrevivir como atributo si la fila cae en
-- Ropa Bebé—, pero los datos de julio son anteriores a esa regla y quedaron
-- con la clave puesta: 1.720 variantes en Evens y 1.005 en Estilo Bonito.
--
-- POR QUÉ IMPORTA, y por qué se ve como "el género me llega mezclado":
--   * Quedó A MEDIAS. En Evens, de 529 productos de MUJER con stock solo 275
--     tienen la clave; en NENA, 10 de 127. `build-propiedades-filtro.ts` pone
--     Género PRIMERO en la barra de filtros (ORDEN_PRIORIDAD), así que lo
--     primero que ofrece la pantalla es el filtro que esconde la mitad del
--     catálogo sin decirlo: filtrar "Mujer" saca 254 prendas de mujer.
--   * PARTE VARIANTES. Dos prendas idénticas quedan como dos filas si una
--     tiene la clave y la otra no — con su stock separado, su propio match de
--     remito y su propia línea en cualquier señal por producto.
--   * En el catálogo público, `product-detail.tsx` arma un selector por cada
--     clave de atributo y exige elegirlas TODAS para agregar al carrito. En
--     661 productos de Evens la clienta tiene que elegir "Género: Mujer" —un
--     desplegable de una sola opción— y en el resto no.
--
-- QUÉ SE CONSERVA: Ropa Bebé. Ahí el género SÍ es un eje de variante real (la
-- misma remera talle 3 en Bebé y en Beba), es la única excepción que ya
-- contempla `resolverCategoriaImport`, y es lo que declara la propia base:
-- la única fila de `categoria_atributos` que apunta a Género es la de "Ropa
-- Bebe" de Estilo Bonito. El criterio de detección es el mismo que usa
-- `esRopaBebeCategoria`: 'bebe' en el slug de la categoría o de sus
-- ancestros. Quedan afuera de la limpieza 476 variantes de Estilo Bonito y 2
-- de Evens.
--
-- CÓMO SE RECORTA EL NOMBRE VISIBLE. `nombre_display` no tiene un formato
-- único: conviven "Mujer / Blanco / 4xl" (valor al principio), "Gris / 42 /
-- Mujer" (al final) y "TALLE: 8 / COLOR: azul / Género: Niño" (con la clave
-- adelante). En vez de tres regex, se parte por " / " y se saca el SEGMENTO
-- que es el género — se acepta como tal el valor solo o precedido de
-- "Género:"/"Genero:", sin distinguir mayúsculas. Verificado sobre las 2.247
-- candidatas: TODAS tienen exactamente un segmento que matchea, ni cero ni
-- dos. Si alguna tuviera otro número, se saltea (ver abajo).
--
-- LO QUE SE SALTEA, Y POR QUÉ NO SE FUERZA. 9 variantes quedan como están
-- porque sacarles el género las volvería indistinguibles de otra variante del
-- mismo producto — misma prenda, mismo talle, mismo color, cargada dos veces.
-- Son de dos formas: contra una hermana que ya estaba sin género ("JEANS
-- COQUETTAS WID LEG / Gris / 38" de Evens y cuatro más), y entre dos
-- candidatas ("PANTALON PELUCHE" de Evens, cargado una vez como Hombre y otra
-- como Mujer con el mismo talle y color). Fusionar dos variantes es decidir
-- qué pasa con dos stocks, y eso es una decisión del comercio, no de una
-- migración. Quedan con la clave puesta y se listan por NOTICE para
-- resolverlas a mano.
--
-- La comparación es `atributos_comparables`, la misma del índice único
-- `idx_variante_identidad`. Comparar el JSONB crudo NO alcanza y la base lo
-- demostró: la primera corrida se cayó con 23505 sobre "PANTALON PELUCHE",
-- donde las dos variantes escriben el color "Marron" y "MARRON".
--
-- EL ESPEJO LEGACY VA EN EL MISMO MOVIMIENTO, y primero. `productos_stock.
-- variante` guarda el `nombre_display` como TEXTO y `create-sale` busca el
-- stock por `producto_id | variante`: renombrar la variante sin renombrar el
-- espejo dejaría 2.242 variantes que no se pueden vender. Se actualiza ANTES,
-- mientras el nombre viejo todavía sirve para emparejar. Verificado que el
-- nombre nuevo no está ocupado en el espejo para ninguna de las que se tocan.
--
-- LO QUE NO SE TOCA:
--   * `stock`. Ni una unidad se mueve, así que el trigger de
--     `movimientos_stock` no escribe nada — su rama de UPDATE devuelve null
--     cuando `new.stock is not distinct from old.stock`. No hace falta la
--     escotilla `comerz.omitir_movimiento`, y usarla acá taparía un cambio
--     real si esta migración estuviera mal.
--   * Las filas de `atributos` / `atributo_valores` de Género: los dos
--     comercios siguen teniendo variantes de Ropa Bebé que las usan.
--   * `ventas_items`. Verificado: CERO renglones de venta atados por nombre a
--     estas variantes sin `variante_id` (los 804 que las tocan lo tienen), así
--     que la anulación no depende del texto que cambia.
--
-- REVERSIBLE. Cada variante y cada fila del espejo que se tocan quedan en
-- `respaldos.genero_en_variantes` con su valor original antes de escribir. El
-- esquema `respaldos` no se expone por PostgREST y no tiene grants para anon
-- ni authenticated. El `_down` reconstruye desde ahí.
--
-- IDEMPOTENTE: corriéndola de nuevo no encuentra candidatas y no hace nada.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.genero_en_variantes (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  tipo      text not null,
  fila      jsonb not null
);

do $$
declare
  v_limpiadas   int;
  v_espejo      int;
  v_relaciones  int;
  v_salteada    record;
  v_salteadas   int := 0;
begin
  -- -------------------------------------------------------------------------
  -- 1. Las candidatas: tienen la clave y NO son Ropa Bebé.
  --
  -- Temporales sin `on commit drop` y con drop explícito: el `on commit`
  -- necesita estar adentro de una transacción, y no todos los runners de
  -- migraciones garantizan una.
  -- -------------------------------------------------------------------------
  drop table if exists tmp_candidatas;
  drop table if exists tmp_plan;
  drop table if exists tmp_aptas;

  create temporary table tmp_candidatas as
  select v.id,
         v.negocio_id,
         v.producto_id,
         v.nombre_display,
         v.atributos,
         v.atributos ->> 'Género' as genero
    from public.producto_variantes v
    join public.productos p   on p.id  = v.producto_id
    left join public.categorias c1 on c1.id = p.categoria_id
    left join public.categorias c2 on c2.id = c1.parent_id
    left join public.categorias c3 on c3.id = c2.parent_id
   where v.atributos ? 'Género'
     and coalesce(c1.slug, '') not like '%bebe%'
     and coalesce(c2.slug, '') not like '%bebe%'
     and coalesce(c3.slug, '') not like '%bebe%';

  -- El nombre recortado y el JSONB sin la clave, más cuántos segmentos del
  -- nombre visible matchearon el género (tiene que ser exactamente uno).
  create temporary table tmp_plan as
  select c.*,
         (c.atributos - 'Género') as resto,
         coalesce(
           nullif(
             array_to_string(
               array(
                 select s.segmento
                   from unnest(regexp_split_to_array(c.nombre_display, ' / '))
                        as s(segmento)
                  where lower(trim(s.segmento)) not in (
                          lower(trim(c.genero)),
                          lower('Género: ' || c.genero),
                          lower('Genero: ' || c.genero))
               ),
               ' / '),
             ''),
           'Único') as nombre_nuevo,
         (select count(*)
            from unnest(regexp_split_to_array(c.nombre_display, ' / '))
                 as s(segmento)
           where lower(trim(s.segmento)) in (
                   lower(trim(c.genero)),
                   lower('Género: ' || c.genero),
                   lower('Genero: ' || c.genero))) as cortes
    from tmp_candidatas c;

  -- -------------------------------------------------------------------------
  -- 2. Las aptas: recorte inequívoco y sin chocar con nada que ya exista.
  --    Todo lo que no entra acá se deja como está: preferimos una variante
  --    con un atributo de más a dos variantes indistinguibles con stock
  --    separado.
  -- -------------------------------------------------------------------------
  create temporary table tmp_aptas as
  select pl.*
    from tmp_plan pl
   where pl.cortes = 1
     -- Contra una hermana que ya existe. La comparación va por
     -- `atributos_comparables`, que es la MISMA que usa el índice único
     -- `idx_variante_identidad` (negocio + producto + identidad normalizada):
     -- comparar el JSONB crudo deja pasar "Marron" contra "MARRON" y el
     -- UPDATE se cae con 23505 a mitad de camino.
     and not exists (
           select 1 from public.producto_variantes v2
            where v2.producto_id = pl.producto_id
              and v2.id <> pl.id
              and public.atributos_comparables(v2.atributos)
                  = public.atributos_comparables(pl.resto))
     -- Y contra OTRA CANDIDATA: dos variantes del mismo producto que solo se
     -- distinguían por el género quedan idénticas al sacárselo. Es el caso de
     -- "PANTALON PELUCHE" de Evens, cargado dos veces —una como Hombre y otra
     -- como Mujer, mismo talle y color—, que son un duplicado real y no un eje
     -- de variante.
     and not exists (
           select 1 from tmp_plan p2
            where p2.producto_id = pl.producto_id
              and p2.id <> pl.id
              and p2.cortes = 1
              and public.atributos_comparables(p2.resto)
                  = public.atributos_comparables(pl.resto))
     and not exists (
           select 1 from public.producto_variantes v3
            where v3.producto_id = pl.producto_id
              and v3.id <> pl.id
              and v3.nombre_display = pl.nombre_nuevo)
     and not exists (
           select 1 from public.productos_stock ps
            where ps.producto_id = pl.producto_id
              and ps.variante = pl.nombre_nuevo);

  if not exists (select 1 from tmp_aptas) then
    raise notice 'Género fuera de variantes: no hay nada que limpiar.';
    drop table if exists tmp_candidatas;
    drop table if exists tmp_plan;
    drop table if exists tmp_aptas;
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Respaldo de todo lo que se va a tocar, antes de tocarlo.
  -- -------------------------------------------------------------------------
  insert into respaldos.genero_en_variantes (tipo, fila)
  select 'variante',
         jsonb_build_object(
           'id', a.id,
           'producto_id', a.producto_id,
           'negocio_id', a.negocio_id,
           'nombre_display', a.nombre_display,
           'atributos', a.atributos,
           'nombre_nuevo', a.nombre_nuevo)
    from tmp_aptas a;

  insert into respaldos.genero_en_variantes (tipo, fila)
  select 'espejo_legacy',
         jsonb_build_object(
           'id', ps.id,
           'producto_id', ps.producto_id,
           'variante', ps.variante)
    from public.productos_stock ps
    join tmp_aptas a
      on a.producto_id = ps.producto_id
     and a.nombre_display = ps.variante;

  insert into respaldos.genero_en_variantes (tipo, fila)
  select 'relacion', to_jsonb(pvv)
    from public.producto_variante_valores pvv
    join tmp_aptas a on a.id = pvv.variante_id
    join public.atributos at on at.id = pvv.atributo_id
   where at.slug = 'genero';

  -- -------------------------------------------------------------------------
  -- 4. El espejo legacy PRIMERO, con el nombre viejo todavía vigente.
  -- -------------------------------------------------------------------------
  update public.productos_stock ps
     set variante = a.nombre_nuevo
    from tmp_aptas a
   where ps.producto_id = a.producto_id
     and ps.variante = a.nombre_display;
  get diagnostics v_espejo = row_count;

  -- -------------------------------------------------------------------------
  -- 5. La variante: fuera la clave del JSONB y fuera el segmento del nombre.
  --    `stock` no se toca, así que el trigger de movimientos no escribe.
  -- -------------------------------------------------------------------------
  update public.producto_variantes v
     set atributos      = a.resto,
         nombre_display = a.nombre_nuevo,
         updated_at     = now()
    from tmp_aptas a
   where v.id = a.id;
  get diagnostics v_limpiadas = row_count;

  -- -------------------------------------------------------------------------
  -- 6. La relación normalizada. El atributo y sus valores SIGUEN existiendo:
  --    los usa Ropa Bebé, que es donde el género sí es una variante.
  -- -------------------------------------------------------------------------
  delete from public.producto_variante_valores pvv
   using tmp_aptas a, public.atributos at
   where pvv.variante_id = a.id
     and pvv.atributo_id = at.id
     and at.slug = 'genero';
  get diagnostics v_relaciones = row_count;

  raise notice 'Género fuera de variantes: % variantes limpiadas, % filas del espejo renombradas, % relaciones borradas.',
    v_limpiadas, v_espejo, v_relaciones;

  -- -------------------------------------------------------------------------
  -- 7. Lo que quedó afuera, con nombre y apellido: son duplicados reales que
  --    alguien tiene que unificar a mano.
  -- -------------------------------------------------------------------------
  for v_salteada in
    select n.nombre as negocio, pr.nombre as producto,
           pl.nombre_display, pl.nombre_nuevo, pl.cortes
      from tmp_plan pl
      left join tmp_aptas a on a.id = pl.id
      join public.productos pr on pr.id = pl.producto_id
      join public.negocios n on n.id = pl.negocio_id
     where a.id is null
     order by n.nombre, pr.nombre
  loop
    v_salteadas := v_salteadas + 1;
    raise notice 'SALTEADA (duplicaría una variante existente): % / % / "%" -> "%"',
      v_salteada.negocio, v_salteada.producto,
      v_salteada.nombre_display, v_salteada.nombre_nuevo;
  end loop;

  if v_salteadas > 0 then
    raise notice '% variantes quedaron con Género porque sacarlo las volvería indistinguibles de otra. Hay que unificarlas a mano.',
      v_salteadas;
  end if;

  drop table if exists tmp_candidatas;
  drop table if exists tmp_plan;
  drop table if exists tmp_aptas;
end $$;

-- ---------------------------------------------------------------------------
-- Guard: fuera de Ropa Bebé no puede quedar ninguna variante con Género,
-- salvo las que se saltearon a propósito por colisión. Mismo criterio que el
-- guard de policies de `20260816100000`: la migración falla si el resultado
-- no es el que dice el encabezado.
-- ---------------------------------------------------------------------------
do $$
declare
  v_quedan int;
begin
  select count(*) into v_quedan
    from public.producto_variantes v
    join public.productos p on p.id = v.producto_id
    left join public.categorias c1 on c1.id = p.categoria_id
    left join public.categorias c2 on c2.id = c1.parent_id
    left join public.categorias c3 on c3.id = c2.parent_id
   where v.atributos ? 'Género'
     and coalesce(c1.slug, '') not like '%bebe%'
     and coalesce(c2.slug, '') not like '%bebe%'
     and coalesce(c3.slug, '') not like '%bebe%'
     -- Las que colisionan con otra variante del mismo producto quedan a
     -- propósito. Misma comparación normalizada que usó la limpieza y que usa
     -- el índice único: cualquiera de las dos formas de colisión (contra una
     -- hermana ya sin género, o contra otra candidata) cae en este exists.
     and not exists (
           select 1 from public.producto_variantes v2
            where v2.producto_id = v.producto_id
              and v2.id <> v.id
              and public.atributos_comparables(v2.atributos - 'Género')
                  = public.atributos_comparables(v.atributos - 'Género'));

  if v_quedan > 0 then
    raise exception 'Quedaron % variantes con Género fuera de Ropa Bebé que no son colisiones. La limpieza no hizo lo que dice.', v_quedan;
  end if;
end $$;
