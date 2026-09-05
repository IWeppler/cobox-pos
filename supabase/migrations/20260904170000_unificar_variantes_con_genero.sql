-- ---------------------------------------------------------------------------
-- Resuelve a mano las 9 variantes que `20260904160000` dejó con "Género".
--
-- Esa migración sacó el género de 2.238 variantes, pero salteó las que al
-- perder la clave quedaban indistinguibles de otra variante del mismo
-- producto: fusionar dos variantes es decidir qué pasa con dos stocks, y eso
-- es del comercio. Las decisiones que siguen las tomó Evelyn (Evens) sobre los
-- cuatro productos afectados; acá se ejecutan.
--
-- Va con UUIDs literales a propósito, igual que `20260831160000`: no es una
-- regla general sino nueve filas concretas que alguien miró una por una.
--
--   1. PANTALON PELUCHE (Evens, HOMBRE › ROPA DEPORTIVA) — SE PARTE EN DOS.
--      Adentro convivían dos prendas distintas: la de hombre (Chocolate 1 y 2,
--      Marrón 1 y 2) y dos pantalones de MUJER en marrón que habían entrado al
--      mismo producto. Los de hombre se quedan y pierden la clave; los de
--      mujer se mudan a un producto nuevo en MUJER › ROPA DEPORTIVA.
--   2. JEANS COQUETTAS WID LEG (Evens) — SE UNIFICAN. Cada talle estaba
--      cargado dos veces, una con género y otra sin: 36 y 38 pasan a 2
--      unidades, 42 queda en 1.
--   3. cargo rustico (Estilo Bonito) — se elimina la línea con género (talle 6
--      verde, stock 0) y queda la que ya no lo tiene.
--   4. jogging rustico recto (Estilo Bonito) — se elimina la línea con género
--      (talle 14 azul) y su unidad se suma a la que ya existe, que pasa a 2.
--
-- LOS RENGLONES DE VENTA SE REAPUNTAN ANTES DE BORRAR. Cuatro ventas apuntan
-- por `variante_id` a variantes que acá desaparecen (una de ellas ANULADA).
-- `ventas_items.variante_id` no tiene FK —el historial tiene que sobrevivir a
-- que la variante se borre— así que el DELETE no fallaría: dejaría el renglón
-- apuntando a la nada y la anulación tendría que volver a buscar la variante
-- por nombre, que es exactamente el problema que `20260816130000` vino a
-- resolver. Se reapuntan a la variante que sobrevive, que es la misma prenda.
--
-- EL MOVIMIENTO DE STOCK SE REGISTRA, con origen EDICION_VARIANTES. No entró
-- ni salió mercadería: por cada +1 en la que sobrevive hay un -1 en la que se
-- borra, y las dos filas quedan en `movimientos_stock`. Es más honesto que
-- apagar el trigger con `comerz.omitir_movimiento` — el nivel de esas
-- variantes SÍ cambió, y quien lea la historia mañana tiene que poder ver por
-- qué.
--
-- REVERSIBLE: todo lo que se toca queda antes en
-- `respaldos.unificacion_variantes_genero`.
--
-- IDEMPOTENTE: si las variantes con género ya no existen, no hace nada.
-- ---------------------------------------------------------------------------
create schema if not exists respaldos;
revoke all on schema respaldos from public;

create table if not exists respaldos.unificacion_variantes_genero (
  id        bigserial primary key,
  tomado_en timestamptz not null default now(),
  tipo      text not null,
  fila      jsonb not null
);

do $$
declare
  -- Evens
  v_evens          uuid := '44468525-8381-4c83-a558-eb7209e386b5';
  v_peluche_hombre uuid := 'd54cad20-c18d-46f1-89c0-9407b8134a98';
  v_cat_mujer_dep  uuid := '0e905beb-418e-4a4b-8996-81add6d4faba'; -- MUJER › ROPA DEPORTIVA
  v_peluche_mujer  uuid;

  -- Variantes de PANTALON PELUCHE
  v_marron1_hombre uuid := '5ea69e79-b608-456a-8c59-dfad99bf70d4';
  v_marron2_hombre uuid := '7e2e9bda-7dbf-4efc-b520-a265412374dc';
  v_marron1_mujer  uuid := '9a931b68-0a84-429c-b912-831000defa21';
  v_marron2_mujer  uuid := '9ded2108-63f2-4cd4-852c-05f5940be6b2';

  -- JEANS COQUETTAS WID LEG: la que se borra -> la que queda
  v_jeans_producto uuid := 'd06c114e-d624-48ed-ad57-2fbb61f9cbbb';

  -- Estilo Bonito
  v_cargo_borrar   uuid := '42f24c1f-ecac-483f-9400-85197667b721';
  v_cargo_queda    uuid := 'f138de91-5e91-456a-9cec-59904cb8811b';
  v_jog_borrar     uuid := '4d881d47-81ff-406b-85d1-16d09d2661a3';
  v_jog_queda      uuid := '45d6f36b-ebdd-41c4-9036-cdaa46d974a2';

  v_borradas       int := 0;
begin
  if not exists (
        select 1 from public.producto_variantes
         where id in (v_marron1_hombre, v_marron2_hombre,
                      v_marron1_mujer,  v_marron2_mujer,
                      v_cargo_borrar,   v_jog_borrar)
           and atributos ? 'Género') then
    raise notice 'Unificación de variantes con género: ya estaba hecha.';
    return;
  end if;

  -- El PORQUÉ del movimiento de stock, para el trigger. Transaction-local.
  perform public.marcar_origen_movimiento('EDICION_VARIANTES', null);

  -- -------------------------------------------------------------------------
  -- 0. RESPALDO de las nueve variantes y de su espejo legacy.
  -- -------------------------------------------------------------------------
  create temporary table tmp_afectadas as
  select v.id
    from public.producto_variantes v
   where v.id in (v_marron1_hombre, v_marron2_hombre, v_marron1_mujer,
                  v_marron2_mujer, v_cargo_borrar, v_jog_borrar,
                  v_cargo_queda, v_jog_queda)
      or (v.producto_id = v_jeans_producto and v.atributos ->> 'Color' ilike 'gris');

  insert into respaldos.unificacion_variantes_genero (tipo, fila)
  select 'variante', to_jsonb(v)
    from public.producto_variantes v join tmp_afectadas a on a.id = v.id;

  insert into respaldos.unificacion_variantes_genero (tipo, fila)
  select 'espejo_legacy', to_jsonb(ps)
    from public.productos_stock ps
    join public.producto_variantes v
      on v.producto_id = ps.producto_id and v.nombre_display = ps.variante
    join tmp_afectadas a on a.id = v.id;

  insert into respaldos.unificacion_variantes_genero (tipo, fila)
  select 'venta_item', to_jsonb(vi)
    from public.ventas_items vi join tmp_afectadas a on a.id = vi.variante_id;

  -- =========================================================================
  -- 1. PANTALON PELUCHE: partir en dos.
  -- =========================================================================

  -- 1.a El producto nuevo, con los mismos datos comerciales y las mismas
  --     fotos: es la misma prenda en marrón, cambia a quién está destinada.
  insert into public.productos (
    negocio_id, nombre, slug, tipo, descripcion, categoria_id,
    precio, precio_costo, publicado, unidad_medida, tratamiento_iva,
    imagen_url, thumbnail_url, grid_url)
  select p.negocio_id, p.nombre, 'pantalon-peluche-mj01', p.tipo, p.descripcion,
         v_cat_mujer_dep, p.precio, p.precio_costo, p.publicado,
         p.unidad_medida, p.tratamiento_iva,
         p.imagen_url, p.thumbnail_url, p.grid_url
    from public.productos p
   where p.id = v_peluche_hombre
  returning id into v_peluche_mujer;

  insert into respaldos.unificacion_variantes_genero (tipo, fila)
  values ('producto_creado',
          jsonb_build_object('id', v_peluche_mujer,
                             'desde', v_peluche_hombre,
                             'categoria_id', v_cat_mujer_dep));

  -- 1.b Las dos de mujer se mudan. El espejo legacy va PRIMERO, mientras el
  --     par (producto viejo, nombre viejo) todavía identifica la fila.
  update public.productos_stock ps
     set producto_id = v_peluche_mujer,
         variante    = 'Marron / ' || (v.atributos ->> 'Talle')
    from public.producto_variantes v
   where v.id in (v_marron1_mujer, v_marron2_mujer)
     and ps.producto_id = v.producto_id
     and ps.variante = v.nombre_display;

  update public.producto_variantes v
     set producto_id    = v_peluche_mujer,
         atributos      = jsonb_build_object(
                            'Color', 'Marron',
                            'Talle', v.atributos ->> 'Talle'),
         nombre_display = 'Marron / ' || (v.atributos ->> 'Talle'),
         updated_at     = now()
   where v.id in (v_marron1_mujer, v_marron2_mujer);

  -- 1.c Las dos de hombre se quedan y pierden la clave. El color queda en la
  --     forma canónica del catálogo ("Marron"), no en la que trajo el remito.
  update public.productos_stock ps
     set variante = 'Marron / ' || (v.atributos ->> 'Talle')
    from public.producto_variantes v
   where v.id in (v_marron1_hombre, v_marron2_hombre)
     and ps.producto_id = v.producto_id
     and ps.variante = v.nombre_display;

  update public.producto_variantes v
     set atributos      = v.atributos - 'Género',
         nombre_display = 'Marron / ' || (v.atributos ->> 'Talle'),
         updated_at     = now()
   where v.id in (v_marron1_hombre, v_marron2_hombre);

  -- =========================================================================
  -- 2. JEANS COQUETTAS WID LEG: unificar por talle.
  --    La que sobrevive es la que NO tiene género; se le suma el stock de la
  --    otra y se hereda su historia de ventas.
  -- =========================================================================
  create temporary table tmp_jeans as
  select con.id as borrar, sin.id as queda, con.stock as stock_a_sumar,
         con.nombre_display as nombre_viejo
    from public.producto_variantes con
    join public.producto_variantes sin
      on sin.producto_id = con.producto_id
     and sin.id <> con.id
     and not (sin.atributos ? 'Género')
     and public.atributos_comparables(sin.atributos)
         = public.atributos_comparables(con.atributos - 'Género')
   where con.producto_id = v_jeans_producto
     and con.atributos ? 'Género';

  update public.ventas_items vi
     set variante_id = j.queda
    from tmp_jeans j
   where vi.variante_id = j.borrar;

  update public.producto_variantes v
     set stock = v.stock + j.stock_a_sumar,
         updated_at = now()
    from tmp_jeans j
   where v.id = j.queda
     and j.stock_a_sumar <> 0;

  update public.productos_stock ps
     set cantidad = ps.cantidad + j.stock_a_sumar
    from tmp_jeans j
    join public.producto_variantes v on v.id = j.queda
   where ps.producto_id = v.producto_id
     and ps.variante = v.nombre_display
     and j.stock_a_sumar <> 0;

  delete from public.productos_stock ps
   using tmp_jeans j
   where ps.producto_id = v_jeans_producto
     and ps.variante = j.nombre_viejo;

  delete from public.producto_variantes v using tmp_jeans j where v.id = j.borrar;
  get diagnostics v_borradas = row_count;

  -- =========================================================================
  -- 3. cargo rustico: la línea con género se va (stock 0) y su venta pasa a
  --    la que queda — la prenda vendida fue esa, no otra.
  -- =========================================================================
  update public.ventas_items set variante_id = v_cargo_queda
   where variante_id = v_cargo_borrar;

  delete from public.productos_stock ps
   using public.producto_variantes v
   where v.id = v_cargo_borrar
     and ps.producto_id = v.producto_id
     and ps.variante = v.nombre_display;

  delete from public.producto_variantes where id = v_cargo_borrar;

  -- =========================================================================
  -- 4. jogging rustico recto: la unidad de la línea con género se suma a la
  --    que ya existe (1 -> 2) y la línea se va.
  -- =========================================================================
  update public.producto_variantes v
     set stock = v.stock + (select b.stock from public.producto_variantes b
                             where b.id = v_jog_borrar),
         updated_at = now()
   where v.id = v_jog_queda
     and exists (select 1 from public.producto_variantes where id = v_jog_borrar);

  update public.productos_stock ps
     set cantidad = ps.cantidad + (select b.stock from public.producto_variantes b
                                    where b.id = v_jog_borrar)
    from public.producto_variantes v
   where v.id = v_jog_queda
     and ps.producto_id = v.producto_id
     and ps.variante = v.nombre_display
     and exists (select 1 from public.producto_variantes where id = v_jog_borrar);

  delete from public.productos_stock ps
   using public.producto_variantes v
   where v.id = v_jog_borrar
     and ps.producto_id = v.producto_id
     and ps.variante = v.nombre_display;

  delete from public.producto_variantes where id = v_jog_borrar;

  raise notice 'Unificación lista. PANTALON PELUCHE partido (producto nuevo %), % variantes de JEANS borradas, cargo rustico y jogging rustico recto resueltos.',
    v_peluche_mujer, v_borradas;

  drop table if exists tmp_afectadas;
  drop table if exists tmp_jeans;
end $$;

-- ---------------------------------------------------------------------------
-- Guard: después de esto NINGUNA variante puede quedar con Género fuera de
-- Ropa Bebé. Ya no hay excepciones que valgan — las nueve que quedaban son
-- justo las que esta migración resolvió.
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
     and coalesce(c3.slug, '') not like '%bebe%';

  if v_quedan > 0 then
    raise exception 'Quedaron % variantes con Género fuera de Ropa Bebé.', v_quedan;
  end if;
end $$;
