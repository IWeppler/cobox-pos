-- ---------------------------------------------------------------------------
-- Estilo Bonito: la marca deja de ser una VARIANTE y pasa a ser del PRODUCTO.
--
-- QUÉ PASABA. 787 variantes de 283 productos traían la marca como un atributo
-- más del JSONB, al lado de talle y color. Es la misma confusión que el
-- importador ya resuelve bien hoy (`columnas-por-rubro.ts` declara qué columna
-- PARTE variantes: talle, color, medida sí; marca y modelo NO) — estos datos
-- son anteriores a esa regla y quedaron del lado equivocado.
--
-- POR QUÉ IMPORTA. Un atributo que no debería partir variantes las parte
-- igual: "Buzo Frizado" quedaba con una variante por cada marca, así que el
-- talle 4 de Cocos y el talle 4 de Luciras eran dos filas de stock distintas
-- sin que nada en la pantalla explicara por qué. Además la marca no se podía
-- buscar ni filtrar como marca: para el sistema era un valor de talle más.
--
-- QUÉ HACE: por cada producto con UNA sola marca entre sus variantes, escribe
-- esa marca en `productos.marca`, la saca del JSONB de cada variante y la saca
-- del `nombre_display`. 271 productos, 732 variantes.
--
-- LOS 12 QUE QUEDAN AFUERA, y por qué. Doce productos tienen MÁS de una marca
-- entre sus variantes ("Buzo Frizado" con Cocos, Lde y Luciras; "calza corta"
-- con cuatro). Ahí la marca no es un dato del producto: son productos
-- DISTINTOS cargados bajo un nombre genérico. Elegir una marca y tirar las
-- otras sería inventar un dato y perder tres; separarlos en productos aparte
-- es una decisión del comercio, no de una migración. Quedan intactos, y por
-- eso el atributo "Marca" del catálogo TAMPOCO se borra: todavía lo usan.
--
-- LO QUE SE VERIFICÓ ANTES DE ESCRIBIR (todo en cero):
--   * 0 colisiones sacando la marca: ninguna variante queda duplicada dentro
--     de su producto, ni por atributos ni por nombre.
--   * 0 nombres ambiguos: en las 732, el valor de la marca NUNCA coincide con
--     el valor de otro atributo de la misma variante, así que el segmento que
--     se recorta del nombre no puede ser el de otra propiedad.
--   * 0 productos con `marca` ya cargada: no se pisa nada.
--   * 52 marcas, todas con una sola forma de escritura (no hay "Bingo fuel"
--     contra "Bingo Fuel" que hubiera que unificar antes).
--
-- EL ESPEJO LEGACY VA EN EL MISMO MOVIMIENTO, y primero: `productos_stock`
-- guarda el `nombre_display` como texto y `create-sale` busca el stock por
-- `producto_id | variante`. Renombrar la variante sin renombrar el espejo deja
-- productos que no se pueden vender. Se actualiza mientras el nombre viejo
-- todavía sirve para emparejar.
--
-- EL CASO RARO, uno solo: un producto cuya única variante tenía la marca como
-- ÚNICO atributo (se llamaba "Lde"). Sin la marca no le queda ningún atributo,
-- así que pasa a llamarse "Único", que es como la app nombra a la variante de
-- un producto sin variantes.
--
-- REVERSIBLE: todo lo que se pisa queda antes en
-- `respaldos.marca_variante_estilo_bonito`.
--
-- IDEMPOTENTE: corre sobre las variantes que TODAVÍA tienen la clave "Marca";
-- una segunda pasada no encuentra ninguna y no hace nada.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.marca_variante_estilo_bonito (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  tipo      text not null,
  fila      jsonb not null
);

-- Saca la marca del nombre visible. Dos formatos conviven en estos datos y la
-- función cubre los dos: con etiqueta ("MARCA: Naranjo / TALLE: 6") y sin ella
-- ("Gris / Luciras / 4"). Se compara segmento por segmento y no con un
-- `replace` de texto: "Lde" adentro de otra palabra no tiene que desaparecer.
-- Si el recorte deja el nombre vacío se devuelve el original; el caso de la
-- variante que se queda sin atributos lo resuelve el bloque de abajo poniendo
-- "Único".
create or replace function public.quitar_marca_del_nombre(p_nombre text, p_marca text)
returns text
language sql
immutable
as $fn$
  select coalesce(nullif(array_to_string(array(
           select s
             from unnest(string_to_array(p_nombre, ' / ')) s
            where lower(trim(s)) not like 'marca:%'
              and lower(trim(s)) <> lower(trim(coalesce(p_marca, '')))
         ), ' / '), ''), p_nombre);
$fn$;

do $$
declare
  v_negocio uuid := '055a0286-a7ff-46f4-9910-ba4941140db6';
begin
  -- Los productos que SÍ se migran: una sola marca entre todas sus variantes.
  create temp table migrables on commit drop as
  select v.producto_id, min(v.atributos->>'Marca') as marca
    from public.producto_variantes v
   where v.negocio_id = v_negocio and v.atributos ? 'Marca'
   group by v.producto_id
  having count(distinct v.atributos->>'Marca') = 1;

  -- El plan por variante, calculado UNA vez: lo usan el espejo y la variante,
  -- y los dos tienen que escribir exactamente el mismo texto.
  create temp table plan on commit drop as
  select v.id,
         v.producto_id,
         v.nombre_display as nombre_viejo,
         v.atributos      as atributos_viejos,
         (v.atributos - 'Marca') as atributos_nuevos,
         case
           when (v.atributos - 'Marca') = '{}'::jsonb then 'Único'
           else public.quitar_marca_del_nombre(v.nombre_display, m.marca)
         end as nombre_nuevo
    from public.producto_variantes v
    join migrables m on m.producto_id = v.producto_id
   where v.negocio_id = v_negocio and v.atributos ? 'Marca';

  -- 1. RESPALDO.
  insert into respaldos.marca_variante_estilo_bonito (tipo, fila)
  select 'producto', jsonb_build_object(
           'id', p.id, 'nombre', p.nombre, 'marca', p.marca)
    from public.productos p join migrables m on m.producto_id = p.id;

  insert into respaldos.marca_variante_estilo_bonito (tipo, fila)
  select 'variante', jsonb_build_object(
           'id', pl.id, 'producto_id', pl.producto_id,
           'nombre_display', pl.nombre_viejo, 'atributos', pl.atributos_viejos)
    from plan pl;

  insert into respaldos.marca_variante_estilo_bonito (tipo, fila)
  select 'relacion', to_jsonb(pvv)
    from public.producto_variante_valores pvv
    join plan pl on pl.id = pvv.variante_id
    join public.atributos a on a.id = pvv.atributo_id
   where a.negocio_id = v_negocio and a.nombre = 'Marca';

  insert into respaldos.marca_variante_estilo_bonito (tipo, fila)
  select 'espejo_legacy', jsonb_build_object(
           'id', ps.id, 'producto_id', ps.producto_id, 'variante', ps.variante)
    from public.productos_stock ps
    join plan pl on pl.producto_id = ps.producto_id and pl.nombre_viejo = ps.variante;

  -- 2. La marca, ahora sí, donde va: en el producto.
  update public.productos p
     set marca = m.marca
    from migrables m
   where p.id = m.producto_id
     and coalesce(trim(p.marca), '') = '';

  -- 3. El espejo legacy, ANTES de que el nombre cambie (ver encabezado).
  update public.productos_stock ps
     set variante = pl.nombre_nuevo
    from plan pl
   where ps.producto_id = pl.producto_id
     and ps.variante = pl.nombre_viejo;

  -- 4. La variante: fuera del JSONB y fuera del nombre visible.
  update public.producto_variantes v
     set atributos = pl.atributos_nuevos,
         nombre_display = pl.nombre_nuevo,
         updated_at = now()
    from plan pl
   where v.id = pl.id;

  -- 5. La relación normalizada de ESTAS variantes. El atributo "Marca" del
  --    catálogo se queda: los 12 productos multimarca lo siguen usando.
  delete from public.producto_variante_valores pvv
   using plan pl, public.atributos a
   where pvv.variante_id = pl.id
     and pvv.atributo_id = a.id
     and a.negocio_id = v_negocio
     and a.nombre = 'Marca';
end $$;

drop function if exists public.quitar_marca_del_nombre(text, text);
