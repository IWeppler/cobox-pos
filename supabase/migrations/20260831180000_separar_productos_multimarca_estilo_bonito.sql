-- ---------------------------------------------------------------------------
-- Estilo Bonito: los 12 productos multimarca se separan en un producto por
-- marca.
--
-- DE DÓNDE VIENE. `20260831170000` movió la marca de la variante al producto
-- en 270 productos y dejó 12 afuera: los que tenían MÁS de una marca entre sus
-- variantes ("Buzo Frizado" con Cocos, Lde y Luciras; "calza corta" con
-- cuatro). Ahí la marca no era un dato del producto sino la prueba de que el
-- producto eran VARIOS: un nombre genérico ("calza corta") juntando mercadería
-- de proveedores distintos, con precios y costos que no tienen por qué
-- coincidir.
--
-- QUÉ HACE. 12 productos entran, 28 salen (16 nuevos). Por cada marca:
--   * la marca con MÁS variantes se queda en el producto original (empate:
--     alfabético), que conserva su id, su slug y su historial;
--   * cada marca restante estrena producto, copiado del original —precio,
--     costo, categoría, fotos, datos fiscales, publicado— con sus variantes
--     mudadas.
-- En los 28, el nombre pasa a incluir la marca ("Buzo Frizado Cocos"): la
-- grilla del POS muestra el NOMBRE, así que tres cards que dijeran "Buzo
-- Frizado" obligarían a abrir cada una para saber cuál es cuál.
--
-- EL ID VIEJO SE QUEDA CON UNA MARCA, y por eso se elige la de más variantes:
-- todo lo que apunta al producto por id —ventas, remitos, alias del
-- conciliador, auditoría— sigue apuntando al original. Eso es correcto para el
-- historial (una venta pasó sobre el producto que existía entonces) y es la
-- razón de que la mudanza mueva VARIANTES y no reescriba el pasado. Las
-- variantes que se mudan se llevan su `id`, así que anular una venta vieja
-- sigue devolviendo el stock a la variante exacta: `ventas_items.variante_id`
-- no cambia.
--
-- LO QUE SE VERIFICÓ (todo en cero): 0 colisiones de nombre dentro de cada
-- marca, 0 variantes que queden sin atributos, 0 reservas y 0 promociones
-- atadas a estos 12 productos, y ninguna marca con caracteres que rompan un
-- slug.
--
-- EL ESPEJO LEGACY se mueve con la variante: `productos_stock` es (producto_id,
-- variante) en texto, así que las filas de las variantes mudadas cambian de
-- producto_id Y de nombre. Si no, `create-sale` busca el stock donde ya no
-- está. Los 11 alias del conciliador de remitos se quedan en el producto
-- original a propósito: cuál alias corresponde a qué marca no está en los
-- datos, y adivinarlo mandaría mercadería al producto equivocado en el próximo
-- remito.
--
-- AL FINAL SE BORRA EL ATRIBUTO "Marca" del catálogo del negocio: ya no queda
-- una sola variante que lo use, y mientras exista el editor lo sigue
-- ofreciendo como propiedad que PARTE variantes, que es exactamente el problema
-- que estas dos migraciones vinieron a deshacer. El combobox de marca no se ve
-- afectado: lee `productos.marca` (ver `getMarcasExistentesAction`), no el
-- catálogo de atributos.
--
-- REVERSIBLE: productos, variantes, relaciones, espejo y el atributo con sus
-- valores quedan en `respaldos.split_marca_estilo_bonito` antes de tocarlos.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.split_marca_estilo_bonito (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  tipo      text not null,
  fila      jsonb not null
);

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
  v_negocio  uuid := '055a0286-a7ff-46f4-9910-ba4941140db6';
  v_atributo uuid;
begin
  -- Una fila por (producto, marca). `rn = 1` es la marca que se queda con el
  -- producto original: la de más variantes, y alfabético para desempatar, para
  -- que la elección no dependa del orden en que Postgres devuelva las filas.
  create temp table destino on commit drop as
  select v.producto_id,
         v.atributos->>'Marca' as marca,
         count(*)              as variantes,
         row_number() over (
           partition by v.producto_id
           order by count(*) desc, v.atributos->>'Marca'
         ) as rn,
         gen_random_uuid() as producto_nuevo_id
    from public.producto_variantes v
   where v.negocio_id = v_negocio and v.atributos ? 'Marca'
   group by v.producto_id, v.atributos->>'Marca';

  -- El plan por variante: a qué producto va a parar y con qué nombre queda.
  create temp table plan on commit drop as
  select v.id,
         v.producto_id as producto_viejo,
         case when d.rn = 1 then v.producto_id else d.producto_nuevo_id end as producto_destino,
         d.marca,
         v.nombre_display as nombre_viejo,
         v.atributos      as atributos_viejos,
         (v.atributos - 'Marca') as atributos_nuevos,
         case
           when (v.atributos - 'Marca') = '{}'::jsonb then 'Único'
           else public.quitar_marca_del_nombre(v.nombre_display, d.marca)
         end as nombre_nuevo
    from public.producto_variantes v
    join destino d
      on d.producto_id = v.producto_id
     and d.marca = v.atributos->>'Marca'
   where v.negocio_id = v_negocio and v.atributos ? 'Marca';

  -- 1. RESPALDO.
  insert into respaldos.split_marca_estilo_bonito (tipo, fila)
  select 'producto_original', to_jsonb(p)
    from public.productos p
   where p.id in (select distinct producto_id from destino);

  insert into respaldos.split_marca_estilo_bonito (tipo, fila)
  select 'variante', jsonb_build_object(
           'id', pl.id, 'producto_id', pl.producto_viejo,
           'nombre_display', pl.nombre_viejo, 'atributos', pl.atributos_viejos)
    from plan pl;

  insert into respaldos.split_marca_estilo_bonito (tipo, fila)
  select 'relacion', to_jsonb(pvv)
    from public.producto_variante_valores pvv
    join plan pl on pl.id = pvv.variante_id;

  insert into respaldos.split_marca_estilo_bonito (tipo, fila)
  select 'espejo_legacy', to_jsonb(ps)
    from public.productos_stock ps
   where ps.producto_id in (select distinct producto_id from destino);

  insert into respaldos.split_marca_estilo_bonito (tipo, fila)
  select 'atributo_marca', to_jsonb(a)
    from public.atributos a
   where a.negocio_id = v_negocio and a.nombre = 'Marca';

  insert into respaldos.split_marca_estilo_bonito (tipo, fila)
  select 'atributo_marca_valor', to_jsonb(av)
    from public.atributo_valores av
    join public.atributos a on a.id = av.atributo_id
   where a.negocio_id = v_negocio and a.nombre = 'Marca';

  -- 2. Los productos NUEVOS, copiados del original. El slug lleva la marca
  --    pegada: no hay unique en la columna, pero el catálogo público resuelve
  --    el producto POR slug, así que dos iguales serían dos links al mismo
  --    lado. El del original no se toca: los links que ya circulan siguen
  --    funcionando.
  insert into public.productos (
    id, negocio_id, nombre, marca, tipo, precio, precio_costo, descripcion,
    categoria_id, imagen_url, thumbnail_url, grid_url, master_url, publicado,
    slug, atributos_globales, tratamiento_iva, unidad_medida, genero
  )
  select d.producto_nuevo_id,
         p.negocio_id,
         p.nombre || ' ' || d.marca,
         d.marca,
         p.tipo, p.precio, p.precio_costo, p.descripcion,
         p.categoria_id, p.imagen_url, p.thumbnail_url, p.grid_url, p.master_url,
         p.publicado,
         coalesce(p.slug, '') || '-' ||
           regexp_replace(lower(translate(d.marca, '''', '')), '[^a-z0-9]+', '-', 'g'),
         p.atributos_globales, p.tratamiento_iva, p.unidad_medida, p.genero
    from destino d
    join public.productos p on p.id = d.producto_id
   where d.rn > 1;

  -- 3. El producto original se queda con su marca, y el nombre la nombra.
  update public.productos p
     set nombre = p.nombre || ' ' || d.marca,
         marca  = d.marca
    from destino d
   where p.id = d.producto_id and d.rn = 1;

  -- 4. El espejo legacy, ANTES de que la variante cambie de dueño y de nombre:
  --    se empareja por el par viejo (producto_id, variante).
  update public.productos_stock ps
     set producto_id = pl.producto_destino,
         variante    = pl.nombre_nuevo
    from plan pl
   where ps.producto_id = pl.producto_viejo
     and ps.variante = pl.nombre_viejo;

  -- 5. La variante se muda, pierde la marca del JSONB y del nombre. Conserva
  --    su `id`: es lo que hace que el historial de ventas siga cerrando.
  update public.producto_variantes v
     set producto_id    = pl.producto_destino,
         atributos      = pl.atributos_nuevos,
         nombre_display = pl.nombre_nuevo,
         updated_at     = now()
    from plan pl
   where v.id = pl.id;

  -- 6. La relación normalizada de la marca, y el atributo del catálogo: ya no
  --    queda ninguna variante que lo use.
  select a.id into v_atributo
    from public.atributos a
   where a.negocio_id = v_negocio and a.nombre = 'Marca';

  if v_atributo is not null then
    delete from public.producto_variante_valores where atributo_id = v_atributo;
    delete from public.atributo_valores          where atributo_id = v_atributo;
    delete from public.atributos                 where id = v_atributo;
  end if;
end $$;

drop function if exists public.quitar_marca_del_nombre(text, text);
