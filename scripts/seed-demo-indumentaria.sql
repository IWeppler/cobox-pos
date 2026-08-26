-- Catálogo de muestra para la tienda DEMO de indumentaria.
--
-- Por qué existe como script versionado y no como algo aplicado a mano: una
-- demo con el catálogo vacío no se puede mostrar, y este catálogo se va a
-- ensuciar (el vendedor vende, descuenta stock, prueba una anulación). Tiene
-- que poder volver a cargarse sin reconstruirlo de memoria.
--
-- NO es una migración: es data de UN negocio, y las migraciones corren contra
-- los cuatro. El negocio se resuelve por SLUG y no por id hardcodeado.
--
-- Es IDEMPOTENTE: todos los slugs son fijos (sin sufijo random) y cada insert
-- lleva su `on conflict do nothing`. Correrlo dos veces no duplica nada y no
-- pisa el stock que la demo haya movido mientras tanto.
--
-- Criterios que copian a un negocio real, para que la demo no enseñe algo que
-- después no se parece a lo que ve el cliente:
--   * markup ×2 sobre el costo, que es lo que hacen Evens (86,3% de los
--     renglones) y Estilo Bonito (97,1%);
--   * productos colgados de la SUBcategoría, nunca del padre;
--   * `producto_variantes` como fuente canónica y `productos_stock` como
--     espejo legacy escrito en el mismo momento;
--   * el origen del movimiento de stock se DECLARA ('IMPORTACION'), así los
--     ~150 movimientos que abre esta carga no entran como 'DESCONOCIDO'.

do $$
declare
  v_negocio uuid;
  v_slug    text := 'nombre-de-prueba2';
begin
  select id into v_negocio from public.negocios where slug = v_slug;
  if v_negocio is null then
    raise exception 'No existe el negocio con slug %', v_slug;
  end if;

  -- El trigger de `producto_variantes` no puede adivinar por qué se movió el
  -- stock; sin esto, la carga entera queda registrada como DESCONOCIDO.
  perform set_config('comerz.origen_movimiento', 'IMPORTACION', true);

  ---------------------------------------------------------------------------
  -- 1. Categorías (árbol de 2 niveles)
  ---------------------------------------------------------------------------
  -- La temporada se carga a mano porque no se deduce de los datos, y sirve
  -- SOLO para silenciar fuera de estación (ver temporada-categoria.ts). Los
  -- abrigos son INVIERNO y los vestidos VERANO; el resto no se silencia nunca.
  create temp table _cat_padre (nombre text, slug text, orden int) on commit drop;
  insert into _cat_padre values
    ('MUJER',           'mujer',           1),
    ('HOMBRE',          'hombre',          2),
    ('NIÑOS',           'ninos',           3),
    ('ROPA DEPORTIVA',  'ropa-deportiva',  4),
    ('CALZADO',         'calzado',         5),
    ('ACCESORIOS',      'accesorios',      6);

  insert into public.categorias (negocio_id, nombre, slug, parent_id, orden, activa, temporada)
  select v_negocio, nombre, slug, null, orden, true, 'TODO_EL_ANIO'
  from _cat_padre
  on conflict do nothing;

  create temp table _cat_hija (padre text, nombre text, slug text, orden int, temporada text) on commit drop;
  insert into _cat_hija values
    ('mujer',          'Remeras y Blusas',      'remeras-y-blusas',      1, 'TODO_EL_ANIO'),
    ('mujer',          'Vestidos',              'vestidos',              2, 'VERANO'),
    ('mujer',          'Pantalones y Jeans',    'pantalones-y-jeans',    3, 'TODO_EL_ANIO'),
    ('mujer',          'Abrigos',               'abrigos',               4, 'INVIERNO'),
    ('hombre',         'Remeras y Camisas',     'remeras-y-camisas',     1, 'TODO_EL_ANIO'),
    ('hombre',         'Pantalones y Jeans',    'pantalones-y-jeans',    2, 'TODO_EL_ANIO'),
    ('hombre',         'Abrigos',               'abrigos',               3, 'INVIERNO'),
    ('ninos',          'Nena',                  'nena',                  1, 'TODO_EL_ANIO'),
    ('ninos',          'Nene',                  'nene',                  2, 'TODO_EL_ANIO'),
    ('ropa-deportiva', 'Calzas y Joggings',     'calzas-y-joggings',     1, 'TODO_EL_ANIO'),
    ('ropa-deportiva', 'Buzos y Camperas',      'buzos-y-camperas',      2, 'INVIERNO'),
    ('calzado',        'Zapatillas',            'zapatillas',            1, 'TODO_EL_ANIO'),
    ('accesorios',     'Bolsos y Mochilas',     'bolsos-y-mochilas',     1, 'TODO_EL_ANIO'),
    ('accesorios',     'Gorras',                'gorras',                2, 'TODO_EL_ANIO');

  insert into public.categorias (negocio_id, nombre, slug, parent_id, orden, activa, temporada)
  select v_negocio, h.nombre, h.slug, p.id, h.orden, true, h.temporada
  from _cat_hija h
  join public.categorias p on p.negocio_id = v_negocio and p.slug = h.padre and p.parent_id is null
  on conflict do nothing;

  ---------------------------------------------------------------------------
  -- 2. Productos
  ---------------------------------------------------------------------------
  -- `talles` en null = producto que no se vende por talle (una gorra, una
  -- mochila): la variante queda definida solo por el color. Forzar un talle
  -- "Único" ahí ensucia el filtro del catálogo con una opción que no elige
  -- nadie.
  create temp table _prod (
    cat_slug   text,
    cat_padre  text,
    nombre     text,
    slug       text,
    precio     numeric,
    genero     text,
    marca      text,
    descripcion text,
    talles     text[],
    colores    text[]
  ) on commit drop;

  insert into _prod values
    ('remeras-y-blusas','mujer','Remera Básica de Algodón','remera-basica-de-algodon',22000,'Mujer','Comerz Basics','Algodón peinado 24/1. El básico que se repone todo el año.','{36,38,40,42,44}','{Negro,Blanco,Beige}'),
    ('remeras-y-blusas','mujer','Blusa de Satén Manga Larga','blusa-de-saten-manga-larga',38000,'Mujer','Comerz Basics','Satén con caída, cuello camisero.','{36,38,40,42}','{Negro,Verde}'),
    ('remeras-y-blusas','mujer','Musculosa Morley','musculosa-morley',17000,'Mujer','Comerz Basics','Morley finito, tiras anchas.','{36,38,40,42}','{Blanco,Rosa}'),
    ('vestidos','mujer','Vestido Midi Floreado','vestido-midi-floreado',62000,'Mujer','Comerz Basics','Viscosa estampada, largo midi.','{36,38,40,42}','{Rosa,Celeste}'),
    ('vestidos','mujer','Vestido Negro de Fiesta','vestido-negro-de-fiesta',89000,'Mujer','Comerz Basics','Crepe con forrería, espalda descubierta.','{36,38,40,42}','{Negro}'),
    ('pantalones-y-jeans','mujer','Jean Mom Tiro Alto','jean-mom-tiro-alto',68000,'Mujer','Denim Sur','Rígido con elastano, calce mom.','{36,38,40,42,44}','{Azul,Negro}'),
    ('pantalones-y-jeans','mujer','Palazo de Lino','palazo-de-lino',52000,'Mujer','Comerz Basics','Lino puro, cintura elastizada.','{36,38,40,42}','{Beige,Negro}'),
    ('abrigos','mujer','Campera Puffer Corta','campera-puffer-corta',125000,'Mujer','Nord','Relleno sintético, capucha desmontable.','{36,38,40,42}','{Negro,Bordó}'),
    ('abrigos','mujer','Saco de Lana Oversize','saco-de-lana-oversize',78000,'Mujer','Nord','Mezcla de lana, calce holgado.','{36,38,40,42}','{Gris,Beige}'),
    ('remeras-y-camisas','hombre','Remera Lisa Cuello Redondo','remera-lisa-cuello-redondo',21000,'Hombre','Comerz Basics','Jersey 100% algodón.','{38,40,42,44,46}','{Negro,Blanco,Gris}'),
    ('remeras-y-camisas','hombre','Camisa de Lino','camisa-de-lino',56000,'Hombre','Comerz Basics','Lino lavado, manga larga.','{38,40,42,44}','{Blanco,Celeste}'),
    ('remeras-y-camisas','hombre','Chomba Piqué','chomba-pique',34000,'Hombre','Comerz Basics','Piqué de algodón, puño acanalado.','{38,40,42,44}','{Azul,Verde}'),
    ('pantalones-y-jeans','hombre','Jean Recto Clásico','jean-recto-clasico',72000,'Hombre','Denim Sur','Denim 12oz, calce recto.','{38,40,42,44,46}','{Azul,Negro}'),
    ('pantalones-y-jeans','hombre','Pantalón Cargo de Gabardina','pantalon-cargo-de-gabardina',64000,'Hombre','Denim Sur','Gabardina con bolsillos laterales.','{38,40,42,44}','{Beige,Verde}'),
    ('abrigos','hombre','Campera Rompeviento','campera-rompeviento',98000,'Hombre','Nord','Impermeable liviana, capucha fija.','{38,40,42,44}','{Negro,Azul}'),
    ('nena','ninos','Vestido de Nena de Algodón','vestido-de-nena-de-algodon',32000,'Niña','Pequeños','Algodón con volados.','{4,6,8,10,12}','{Rosa,Celeste}'),
    ('nena','ninos','Calza de Nena Deportiva','calza-de-nena-deportiva',19000,'Niña','Pequeños','Algodón con lycra.','{4,6,8,10,12}','{Negro,Rosa}'),
    ('nene','ninos','Remera de Nene Estampada','remera-de-nene-estampada',18000,'Niño','Pequeños','Jersey con estampa frontal.','{4,6,8,10,12}','{Blanco,Azul}'),
    ('nene','ninos','Jogging de Nene de Frisa','jogging-de-nene-de-frisa',36000,'Niño','Pequeños','Frisa perchada, puño elastizado.','{4,6,8,10,12}','{Gris,Negro}'),
    ('calzas-y-joggings','ropa-deportiva','Calza Deportiva Talle Alto','calza-deportiva-talle-alto',42000,'Mujer','Move','Suplex con compresión, bolsillo lateral.','{36,38,40,42}','{Negro,Gris}'),
    ('calzas-y-joggings','ropa-deportiva','Jogging de Frisa de Mujer','jogging-de-frisa-de-mujer',48000,'Mujer','Move','Frisa liviana, calce jogger.','{36,38,40,42}','{Negro,Beige}'),
    ('buzos-y-camperas','ropa-deportiva','Buzo Canguro de Frisa','buzo-canguro-de-frisa',55000,'Unisex','Move','Frisa perchada, bolsillo canguro.','{38,40,42,44}','{Gris,Negro,Bordó}'),
    ('zapatillas','calzado','Zapatilla Urbana de Lona','zapatilla-urbana-de-lona',85000,'Unisex','Move','Lona con suela de goma vulcanizada.','{37,38,39,40,41,42,43}','{Blanco,Negro}'),
    ('bolsos-y-mochilas','accesorios','Mochila Urbana','mochila-urbana',58000,'Unisex','Nord','Poliéster con porta notebook de 15".',null,'{Negro,Gris}'),
    ('gorras','accesorios','Gorra Trucker','gorra-trucker',24000,'Unisex','Move','Frente de gabardina y malla trasera.',null,'{Negro,Blanco,Azul}');

  -- `tipo` repite el nombre de la categoría: es lo que hacen los productos
  -- reales de Evens, y de ahí sale el rótulo del POS.
  -- El costo es la mitad del precio (markup ×2), como en los negocios vivos.
  insert into public.productos (
    negocio_id, nombre, tipo, slug, categoria_id, descripcion, marca, genero,
    precio, precio_costo, tratamiento_iva, unidad_medida, publicado, atributos_globales
  )
  select
    v_negocio, p.nombre, c.nombre, p.slug, c.id, p.descripcion, p.marca, p.genero,
    p.precio, p.precio / 2, 'GRAVADO_21', 'UNIDAD', true, '{}'::jsonb
  from _prod p
  join public.categorias padre on padre.negocio_id = v_negocio and padre.slug = p.cat_padre and padre.parent_id is null
  join public.categorias c     on c.negocio_id = v_negocio and c.slug = p.cat_slug and c.parent_id = padre.id
  on conflict (negocio_id, slug) do nothing;

  ---------------------------------------------------------------------------
  -- 3. Atributos y sus valores
  ---------------------------------------------------------------------------
  -- Se crean ANTES que las variantes porque `producto_variante_valores` los
  -- necesita. La forma canónica (capitalizada, sin acentos en el slug) es la
  -- misma que produce normalizarAtributoKeyValor: si acá se escribiera
  -- distinto, el próximo alta desde la UI crearía un "Color" duplicado.
  insert into public.atributos (negocio_id, nombre, slug, tipo, orden, activo)
  values (v_negocio, 'Talle', 'talle', 'TEXT', 1, true),
         (v_negocio, 'Color', 'color', 'TEXT', 2, true)
  on conflict (negocio_id, slug) do nothing;

  insert into public.atributo_valores (negocio_id, atributo_id, valor, slug, orden, activo)
  select v_negocio, a.id, t.valor, t.slug, t.orden, true
  from public.atributos a
  join (values
      ('4','4',1),('6','6',2),('8','8',3),('10','10',4),('12','12',5),
      ('36','36',6),('37','37',7),('38','38',8),('39','39',9),('40','40',10),
      ('41','41',11),('42','42',12),('43','43',13),('44','44',14),('46','46',15)
    ) as t(valor, slug, orden) on true
  where a.negocio_id = v_negocio and a.slug = 'talle'
  on conflict (atributo_id, slug) do nothing;

  insert into public.atributo_valores (negocio_id, atributo_id, valor, slug, orden, activo)
  -- El slug va escrito y no calculado: `slugify` vive en TypeScript, y "Bordó"
  -- tiene que quedar 'bordo' igual que si lo hubiera creado la UI.
  select v_negocio, a.id, t.valor, t.slug, t.orden, true
  from public.atributos a
  join (values
      ('Negro','negro',1),('Blanco','blanco',2),('Gris','gris',3),
      ('Azul','azul',4),('Celeste','celeste',5),('Verde','verde',6),
      ('Beige','beige',7),('Rosa','rosa',8),('Bordó','bordo',9)
    ) as t(valor, slug, orden) on true
  where a.negocio_id = v_negocio and a.slug = 'color'
  on conflict (atributo_id, slug) do nothing;

  ---------------------------------------------------------------------------
  -- 4. Variantes (fuente canónica) + espejo legacy
  ---------------------------------------------------------------------------
  -- El stock sale de un hash del nombre de la variante: da entre 1 y 6, es
  -- distinto por variante (así el listado no se ve sintético) y es ESTABLE, o
  -- sea que volver a correr el script no cambia lo que ya había.
  --
  -- precio y costo van en NULL a propósito: la variante hereda los del
  -- producto. Un precio por talle que repite el del padre es un número que
  -- alguien va a tener que mantener sincronizado a mano.
  create temp table _var on commit drop as
  select
    pr.id as producto_id,
    t.talle,
    col.color,
    case when t.talle is null then col.color else t.talle || ' / ' || col.color end as nombre_display,
    case when t.talle is null then jsonb_build_object('Color', col.color)
         else jsonb_build_object('Talle', t.talle, 'Color', col.color) end as atributos,
    (abs(hashtext(pr.slug || coalesce(t.talle,'') || col.color)) % 6) + 1 as stock
  from _prod p
  join public.productos pr on pr.negocio_id = v_negocio and pr.slug = p.slug
  cross join lateral unnest(coalesce(p.talles, array[null]::text[])) as t(talle)
  cross join lateral unnest(p.colores) as col(color);

  insert into public.producto_variantes (
    negocio_id, producto_id, nombre_display, atributos, precio, costo, stock, stock_minimo, activa
  )
  select v_negocio, v.producto_id, v.nombre_display, v.atributos, null, null, v.stock, 0, true
  from _var v
  where not exists (
    select 1 from public.producto_variantes ex
    where ex.producto_id = v.producto_id and ex.nombre_display = v.nombre_display
  );

  insert into public.productos_stock (negocio_id, producto_id, variante, cantidad)
  select v_negocio, v.producto_id, v.nombre_display, v.stock
  from _var v
  on conflict (producto_id, variante) do nothing;

  -- La relación normalizada, que es lo que usa el facetado del catálogo. Sin
  -- estas filas el JSONB alcanza para mostrar la variante pero el filtro por
  -- talle o color del catálogo público queda vacío.
  insert into public.producto_variante_valores (negocio_id, variante_id, atributo_id, atributo_valor_id)
  select v_negocio, pv.id, a.id, av.id
  from public.producto_variantes pv
  join public.productos pr on pr.id = pv.producto_id
  join _prod p on p.slug = pr.slug
  cross join lateral (
    values ('talle', pv.atributos ->> 'Talle'), ('color', pv.atributos ->> 'Color')
  ) as par(attr_slug, valor)
  join public.atributos a on a.negocio_id = v_negocio and a.slug = par.attr_slug
  join public.atributo_valores av on av.atributo_id = a.id and av.valor = par.valor
  where pr.negocio_id = v_negocio
    and par.valor is not null
    and not exists (
      select 1 from public.producto_variante_valores ex
      where ex.variante_id = pv.id and ex.atributo_id = a.id
    );

  raise notice 'Catálogo demo cargado en % (%)', v_slug, v_negocio;
end $$;
