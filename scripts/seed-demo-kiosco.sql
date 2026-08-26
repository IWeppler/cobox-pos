-- Catálogo de muestra para la tienda DEMO de kiosco (slug `kiosco-demo`).
--
-- Hermano de seed-demo-indumentaria.sql, con las diferencias que hacen que un
-- kiosco NO sea una tienda de ropa:
--
--   * El producto NO se parte en variantes. Una gaseosa de 2,25 L es un
--     producto, no un talle de otra cosa, así que casi todo va con una única
--     variante 'Único' — el mismo camino que usa el alta manual cuando no se
--     tildan opciones. Las excepciones son los sueltos (maní, frutos secos),
--     donde el PESO sí parte variantes, que es justo la columna que
--     `columnas-por-rubro.ts` le agrega al rubro `quioscos`.
--   * El margen NO es uniforme. En indumentaria el precio es una regla (×2
--     sobre el costo, 86% de los renglones de Evens); acá cada categoría tiene
--     el suyo, y los cigarrillos van al 13% porque el precio lo fija la
--     tabacalera. Eso hace que el ranking de `margen_realizado` diga algo de
--     verdad en este negocio y no solo "quién recibió más descuento".
--   * El código de barras SÍ existe y vive en `producto_variantes.sku`, misma
--     columna que en electro guarda el EAN y en indumentaria el código de
--     modelo. Los de acá arrancan en 29: el rango 20-29 es el reservado para
--     uso INTERNO del comercio, así que ningún código de esta demo puede
--     chocar con el de un producto real del mercado.
--
-- Idempotente: slugs fijos y `on conflict do nothing`, igual que su hermano.

do $$
declare
  v_negocio uuid;
  v_slug    text := 'kiosco-demo';
begin
  select id into v_negocio from public.negocios where slug = v_slug;
  if v_negocio is null then
    raise exception 'No existe el negocio con slug %', v_slug;
  end if;

  perform set_config('comerz.origen_movimiento', 'IMPORTACION', true);

  ---------------------------------------------------------------------------
  -- 1. Categorías
  ---------------------------------------------------------------------------
  -- Todas TODO_EL_ANIO salvo las estacionales de verdad: el helado y la
  -- cerveza se venden distinto en enero, pero la temporada solo sirve para
  -- SILENCIAR fuera de estación, nunca para sugerir, así que se carga con
  -- cuidado y el default no esconde nada.
  create temp table _cat_padre (nombre text, slug text, orden int) on commit drop;
  insert into _cat_padre values
    ('GOLOSINAS',          'golosinas',          1),
    ('BEBIDAS',            'bebidas',            2),
    ('SNACKS',             'snacks',             3),
    ('CIGARRILLOS',        'cigarrillos',        4),
    ('ALMACÉN',            'almacen',            5),
    ('LIMPIEZA Y VARIOS',  'limpieza-y-varios',  6);

  insert into public.categorias (negocio_id, nombre, slug, parent_id, orden, activa, temporada)
  select v_negocio, nombre, slug, null, orden, true, 'TODO_EL_ANIO'
  from _cat_padre
  on conflict do nothing;

  create temp table _cat_hija (padre text, nombre text, slug text, orden int, temporada text) on commit drop;
  insert into _cat_hija values
    ('golosinas',         'Chocolates',          'chocolates',          1, 'TODO_EL_ANIO'),
    ('golosinas',         'Caramelos y Chicles', 'caramelos-y-chicles', 2, 'TODO_EL_ANIO'),
    ('golosinas',         'Alfajores',           'alfajores',           3, 'TODO_EL_ANIO'),
    ('bebidas',           'Gaseosas',            'gaseosas',            1, 'TODO_EL_ANIO'),
    ('bebidas',           'Aguas y Jugos',       'aguas-y-jugos',       2, 'TODO_EL_ANIO'),
    ('bebidas',           'Cervezas y Vinos',    'cervezas-y-vinos',    3, 'TODO_EL_ANIO'),
    ('bebidas',           'Energizantes',        'energizantes',        4, 'TODO_EL_ANIO'),
    ('snacks',            'Papas y Palitos',     'papas-y-palitos',     1, 'TODO_EL_ANIO'),
    ('snacks',            'Galletitas',          'galletitas',          2, 'TODO_EL_ANIO'),
    ('snacks',            'Frutos Secos',        'frutos-secos',        3, 'TODO_EL_ANIO'),
    ('cigarrillos',       'Cigarrillos',         'cigarrillos',         1, 'TODO_EL_ANIO'),
    ('cigarrillos',       'Accesorios',          'accesorios',          2, 'TODO_EL_ANIO'),
    ('almacen',           'Lácteos',             'lacteos',             1, 'TODO_EL_ANIO'),
    ('almacen',           'Fiambrería',          'fiambreria',          2, 'TODO_EL_ANIO'),
    ('almacen',           'Panificados',         'panificados',         3, 'TODO_EL_ANIO'),
    ('almacen',           'Yerba y Café',        'yerba-y-cafe',        4, 'TODO_EL_ANIO'),
    ('limpieza-y-varios', 'Higiene Personal',    'higiene-personal',    1, 'TODO_EL_ANIO'),
    ('limpieza-y-varios', 'Limpieza',            'limpieza',            2, 'TODO_EL_ANIO'),
    ('limpieza-y-varios', 'Pilas y Varios',      'pilas-y-varios',      3, 'TODO_EL_ANIO');

  insert into public.categorias (negocio_id, nombre, slug, parent_id, orden, activa, temporada)
  select v_negocio, h.nombre, h.slug, p.id, h.orden, true, h.temporada
  from _cat_hija h
  join public.categorias p on p.negocio_id = v_negocio and p.slug = h.padre and p.parent_id is null
  on conflict do nothing;

  ---------------------------------------------------------------------------
  -- 2. Productos
  ---------------------------------------------------------------------------
  -- `costo` va escrito y no calculado con una regla: el margen del kiosco lo
  -- fija el proveedor y cambia por familia (13% en cigarrillos, ~40% en
  -- golosinas). Derivarlo de un porcentaje único sería volver a inventar el
  -- markup uniforme de la tienda de ropa.
  -- `pesos` en null = producto sin variantes: se vende por envase.
  create temp table _prod (
    cat_slug text, cat_padre text, nombre text, slug text,
    precio numeric, costo numeric, marca text, ean text,
    stock int, pesos text[]
  ) on commit drop;

  insert into _prod values
    ('chocolates','golosinas','Chocolate con Leche 100g','chocolate-con-leche-100g',3200,2000,'Cordillera','2900000000017',40,null),
    ('chocolates','golosinas','Chocolate Blanco 100g','chocolate-blanco-100g',3400,2150,'Cordillera','2900000000024',28,null),
    ('chocolates','golosinas','Bombón Relleno','bombon-relleno',900,560,'Cordillera','2900000000031',120,null),
    ('caramelos-y-chicles','golosinas','Chicles Menta x10','chicles-menta-x10',1200,720,'Fresh','2900000000048',85,null),
    ('caramelos-y-chicles','golosinas','Caramelos Surtidos 100g','caramelos-surtidos-100g',1500,900,'Dulcor','2900000000055',60,null),
    ('caramelos-y-chicles','golosinas','Pastillas Mentoladas','pastillas-mentoladas',1100,660,'Fresh','2900000000062',70,null),
    ('alfajores','golosinas','Alfajor Simple','alfajor-simple',1800,1150,'Del Sur','2900000000079',95,null),
    ('alfajores','golosinas','Alfajor Triple','alfajor-triple',2600,1650,'Del Sur','2900000000086',64,null),
    ('alfajores','golosinas','Alfajor Premium','alfajor-premium',3100,2000,'Del Sur','2900000000093',38,null),
    ('gaseosas','bebidas','Gaseosa Cola 2,25L','gaseosa-cola-2-25l',4200,3100,'Refres','2900000000109',48,null),
    ('gaseosas','bebidas','Gaseosa Cola 500ml','gaseosa-cola-500ml',2000,1400,'Refres','2900000000116',72,null),
    ('gaseosas','bebidas','Gaseosa Lima Limón 1,5L','gaseosa-lima-limon-1-5l',3400,2500,'Refres','2900000000123',36,null),
    ('aguas-y-jugos','bebidas','Agua Mineral 500ml','agua-mineral-500ml',1500,950,'Sierra','2900000000130',90,null),
    ('aguas-y-jugos','bebidas','Agua Saborizada 1,5L','agua-saborizada-1-5l',2900,2000,'Sierra','2900000000147',42,null),
    ('aguas-y-jugos','bebidas','Jugo Exprimido 1L','jugo-exprimido-1l',2700,1900,'Huerta','2900000000154',30,null),
    ('cervezas-y-vinos','bebidas','Cerveza Rubia Lata 473ml','cerveza-rubia-lata-473ml',2800,2100,'Bierhaus','2900000000161',66,null),
    ('cervezas-y-vinos','bebidas','Cerveza Rubia 1L','cerveza-rubia-1l',4300,3300,'Bierhaus','2900000000178',34,null),
    ('cervezas-y-vinos','bebidas','Vino Tinto 750ml','vino-tinto-750ml',6500,4800,'Viñas','2900000000185',22,null),
    ('energizantes','bebidas','Energizante 250ml','energizante-250ml',3600,2600,'Volt','2900000000192',44,null),
    ('papas-y-palitos','snacks','Papas Fritas Clásicas 120g','papas-fritas-clasicas-120g',4200,3000,'Crock','2900000000208',52,null),
    ('papas-y-palitos','snacks','Palitos de Maíz 90g','palitos-de-maiz-90g',2600,1800,'Crock','2900000000215',48,null),
    ('papas-y-palitos','snacks','Nachos 150g','nachos-150g',4600,3300,'Crock','2900000000222',26,null),
    ('galletitas','snacks','Galletitas Dulces x3','galletitas-dulces-x3',2500,1700,'Molino','2900000000239',58,null),
    ('galletitas','snacks','Galletitas Saladas 300g','galletitas-saladas-300g',2900,2000,'Molino','2900000000246',40,null),
    ('galletitas','snacks','Obleas Rellenas','obleas-rellenas',1600,1000,'Molino','2900000000253',75,null),
    ('cigarrillos','cigarrillos','Cigarrillos Box 20','cigarrillos-box-20',6800,5900,'Nacional','2900000000260',80,null),
    ('cigarrillos','cigarrillos','Cigarrillos Box 10','cigarrillos-box-10',3900,3400,'Nacional','2900000000277',45,null),
    ('accesorios','cigarrillos','Encendedor','encendedor',1900,1150,'Flama','2900000000284',60,null),
    ('accesorios','cigarrillos','Papelillos','papelillos',1200,700,'Flama','2900000000291',35,null),
    ('lacteos','almacen','Leche Entera 1L','leche-entera-1l',2400,1850,'La Vaca','2900000000307',30,null),
    ('lacteos','almacen','Yogur Bebible 900ml','yogur-bebible-900ml',3300,2450,'La Vaca','2900000000314',24,null),
    ('panificados','almacen','Pan Lactal 500g','pan-lactal-500g',3800,2800,'Molino','2900000000321',18,null),
    ('panificados','almacen','Facturas x6','facturas-x6',5200,3600,null,'2900000000338',12,null),
    -- El resto de la panadería. Margen más alto que el almacén envasado
    -- (~45%) y stock chico: es lo que se repone todos los días y lo que
    -- sobra a la noche se remata, así que un kiosco no guarda 40 unidades.
    ('panificados','almacen','Docena de Facturas','docena-de-facturas',9500,6300,null,'2900000000444',8,null),
    ('panificados','almacen','Medialuna','medialuna',900,520,null,'2900000000451',60,null),
    ('panificados','almacen','Torta Frita','torta-frita',700,380,null,'2900000000468',40,null),
    ('panificados','almacen','Pan de Campo 700g','pan-de-campo-700g',4800,3100,null,'2900000000475',10,null),
    ('panificados','almacen','Budín de Vainilla','budin-de-vainilla',6500,4200,'Molino','2900000000482',9,null),
    ('panificados','almacen','Prepizzas x2','prepizzas-x2',4200,2900,'Molino','2900000000499',14,null),
    ('yerba-y-cafe','almacen','Yerba Mate 500g','yerba-mate-500g',6900,5200,'Del Monte','2900000000345',26,null),
    ('yerba-y-cafe','almacen','Café Molido 250g','cafe-molido-250g',8200,6100,'Aroma','2900000000352',16,null),
    ('higiene-personal','limpieza-y-varios','Papel Higiénico x4','papel-higienico-x4',4900,3600,'Suave','2900000000369',28,null),
    ('higiene-personal','limpieza-y-varios','Jabón de Tocador','jabon-de-tocador',1600,1050,'Suave','2900000000376',40,null),
    ('limpieza','limpieza-y-varios','Lavandina 1L','lavandina-1l',2200,1500,'Brillo','2900000000383',22,null),
    ('limpieza','limpieza-y-varios','Detergente 500ml','detergente-500ml',3100,2200,'Brillo','2900000000390',20,null),
    ('pilas-y-varios','limpieza-y-varios','Pilas AA x2','pilas-aa-x2',3400,2200,'Volt','2900000000406',34,null),
    ('pilas-y-varios','limpieza-y-varios','Preservativos x3','preservativos-x3',4800,3200,'Cuidar','2900000000413',26,null),
    -- Los dos sueltos: acá el PESO sí parte variantes, con su propio precio.
    ('frutos-secos','snacks','Maní con Sal','mani-con-sal',null,null,'Nuez','2900000000420',null,'{100g,250g,500g}'),
    ('frutos-secos','snacks','Mix de Frutos Secos','mix-de-frutos-secos',null,null,'Nuez','2900000000437',null,'{100g,250g}');

  ---------------------------------------------------------------------------
  -- 2 bis. Lo que se vende POR PESO
  ---------------------------------------------------------------------------
  -- Un kiosco vende las dos cosas en el mismo mostrador: la gaseosa por
  -- unidad y el jamón al corte por kilo. Por eso `unidad_medida` es del
  -- PRODUCTO y no del comercio ni del rubro — si fuera un flag del comercio,
  -- este kiosco tendría que tipear "1,000" para cobrar una Coca
  -- (`shared/lib/unidad-venta.ts`).
  --
  -- El precio es POR KILO y la cantidad admite tres decimales, que es la
  -- resolución de cualquier balanza comercial. Un renglón de 0,250 kg de
  -- jamón a $18.900 el kilo cobra $4.725.
  --
  -- Sin código de barras a propósito: el fiambre al corte no trae EAN de
  -- fábrica — lo imprime la balanza al pesar, con el peso adentro. Un EAN fijo
  -- acá sería un dato inventado.
  create temp table _prod_peso (
    cat_slug text, cat_padre text, nombre text, slug text,
    precio_kg numeric, costo_kg numeric, marca text, stock_kg numeric
  ) on commit drop;

  insert into _prod_peso values
    ('fiambreria','almacen','Jamón Cocido','jamon-cocido',18900,13200,'La Vaca',4.500),
    ('fiambreria','almacen','Queso Cremoso','queso-cremoso',16500,11800,'La Vaca',3.200),
    ('fiambreria','almacen','Salame Milán','salame-milan',22000,15400,'Don Pedro',2.100),
    ('fiambreria','almacen','Aceitunas Verdes','aceitunas-verdes',9800,6300,null,5.000),
    ('caramelos-y-chicles','golosinas','Caramelos a Granel','caramelos-a-granel',7200,4400,null,6.500),
    ('frutos-secos','snacks','Maní con Sal a Granel','mani-con-sal-a-granel',12800,8500,'Nuez',3.800),
    -- El pan se pide por kilo o por medio kilo, nunca "una unidad de pan":
    -- son el caso más común de venta por peso en un comercio de barrio.
    ('panificados','almacen','Pan Francés','pan-frances',3200,2100,null,8.000),
    ('panificados','almacen','Criollos','criollos',8900,5800,null,4.000);

  insert into public.productos (
    negocio_id, nombre, tipo, slug, categoria_id, marca,
    precio, precio_costo, tratamiento_iva, unidad_medida, publicado, atributos_globales
  )
  select
    v_negocio, p.nombre, c.nombre, p.slug, c.id, p.marca,
    p.precio_kg, p.costo_kg, 'GRAVADO_21', 'KG', true, '{}'::jsonb
  from _prod_peso p
  join public.categorias padre on padre.negocio_id = v_negocio and padre.slug = p.cat_padre and padre.parent_id is null
  join public.categorias c     on c.negocio_id = v_negocio and c.slug = p.cat_slug and c.parent_id = padre.id
  on conflict (negocio_id, slug) do nothing;

  -- Una sola variante, como cualquier producto sin opciones. El stock queda en
  -- KILOS con decimales: 4,500 kg de jamón es un estado normal del mostrador,
  -- y antes de que la cadena de cantidad fuera numeric no había forma de
  -- escribirlo.
  insert into public.producto_variantes (
    negocio_id, producto_id, nombre_display, atributos, sku, precio, costo, stock, stock_minimo, activa
  )
  select v_negocio, pr.id, 'Único', '{}'::jsonb, null, null, null, p.stock_kg, 0.500, true
  from _prod_peso p
  join public.productos pr on pr.negocio_id = v_negocio and pr.slug = p.slug
  where not exists (
    select 1 from public.producto_variantes ex
    where ex.producto_id = pr.id and ex.nombre_display = 'Único'
  );

  insert into public.productos (
    negocio_id, nombre, tipo, slug, categoria_id, marca,
    precio, precio_costo, tratamiento_iva, unidad_medida, publicado, atributos_globales
  )
  select
    v_negocio, p.nombre, c.nombre, p.slug, c.id, p.marca,
    coalesce(p.precio, 0), coalesce(p.costo, 0),
    'GRAVADO_21', 'UNIDAD', true, '{}'::jsonb
  from _prod p
  join public.categorias padre on padre.negocio_id = v_negocio and padre.slug = p.cat_padre and padre.parent_id is null
  join public.categorias c     on c.negocio_id = v_negocio and c.slug = p.cat_slug and c.parent_id = padre.id
  on conflict (negocio_id, slug) do nothing;

  ---------------------------------------------------------------------------
  -- 3. Variantes
  ---------------------------------------------------------------------------
  -- Sin peso: UNA variante 'Único', con el EAN en `sku` y precio/costo en null
  -- (hereda del producto). Es exactamente lo que escribe create-product.ts
  -- cuando el alta no tiene opciones.
  insert into public.producto_variantes (
    negocio_id, producto_id, nombre_display, atributos, sku, precio, costo, stock, stock_minimo, activa
  )
  select v_negocio, pr.id, 'Único', '{}'::jsonb, p.ean, null, null, p.stock, 5, true
  from _prod p
  join public.productos pr on pr.negocio_id = v_negocio and pr.slug = p.slug
  where p.pesos is null
    and not exists (
      select 1 from public.producto_variantes ex
      where ex.producto_id = pr.id and ex.nombre_display = 'Único'
    );

  -- Con peso: una variante por presentación, cada una con SU precio. El suelto
  -- de 500g no vale cinco veces el de 100g, así que el precio no se puede
  -- heredar del producto.
  insert into public.producto_variantes (
    negocio_id, producto_id, nombre_display, atributos, sku, precio, costo, stock, stock_minimo, activa
  )
  select v_negocio, pr.id, t.peso, jsonb_build_object('Peso', t.peso),
         p.ean || '-' || t.orden, t.precio, t.costo, t.stock, 3, true
  from _prod p
  join public.productos pr on pr.negocio_id = v_negocio and pr.slug = p.slug
  join (values
      ('mani-con-sal',       '100g', 1,  1800::numeric, 1150::numeric, 30),
      ('mani-con-sal',       '250g', 2,  3900::numeric, 2600::numeric, 22),
      ('mani-con-sal',       '500g', 3,  7200::numeric, 4900::numeric, 14),
      ('mix-de-frutos-secos','100g', 1,  3200::numeric, 2200::numeric, 20),
      ('mix-de-frutos-secos','250g', 2,  7400::numeric, 5200::numeric, 12)
    ) as t(slug, peso, orden, precio, costo, stock) on t.slug = p.slug
  where p.pesos is not null
    and not exists (
      select 1 from public.producto_variantes ex
      where ex.producto_id = pr.id and ex.nombre_display = t.peso
    );

  -- El producto padre de un suelto muestra el precio de la presentación más
  -- chica: es lo que se ve en el listado, y un 0 ahí parecería un error de
  -- carga.
  update public.productos pr
     set precio = m.precio, precio_costo = m.costo
    from (
      select pv.producto_id, min(pv.precio) as precio, min(pv.costo) as costo
      from public.producto_variantes pv
      where pv.negocio_id = v_negocio and pv.precio is not null
      group by pv.producto_id
    ) m
   where pr.id = m.producto_id and pr.precio = 0;

  ---------------------------------------------------------------------------
  -- 4. Atributo Peso + espejo legacy de stock
  ---------------------------------------------------------------------------
  insert into public.atributos (negocio_id, nombre, slug, tipo, orden, activo)
  values (v_negocio, 'Peso', 'peso', 'TEXT', 1, true)
  on conflict (negocio_id, slug) do nothing;

  insert into public.atributo_valores (negocio_id, atributo_id, valor, slug, orden, activo)
  select v_negocio, a.id, t.valor, t.slug, t.orden, true
  from public.atributos a
  join (values ('100g','100g',1),('250g','250g',2),('500g','500g',3)) as t(valor, slug, orden) on true
  where a.negocio_id = v_negocio and a.slug = 'peso'
  on conflict (atributo_id, slug) do nothing;

  insert into public.producto_variante_valores (negocio_id, variante_id, atributo_id, atributo_valor_id)
  select v_negocio, pv.id, a.id, av.id
  from public.producto_variantes pv
  join public.atributos a on a.negocio_id = v_negocio and a.slug = 'peso'
  join public.atributo_valores av on av.atributo_id = a.id and av.valor = pv.atributos ->> 'Peso'
  where pv.negocio_id = v_negocio
    and pv.atributos ? 'Peso'
    and not exists (
      select 1 from public.producto_variante_valores ex
      where ex.variante_id = pv.id and ex.atributo_id = a.id
    );

  insert into public.productos_stock (negocio_id, producto_id, variante, cantidad)
  select v_negocio, pv.producto_id, pv.nombre_display, pv.stock
  from public.producto_variantes pv
  where pv.negocio_id = v_negocio
  on conflict (producto_id, variante) do nothing;

  raise notice 'Catálogo de kiosco cargado en %', v_slug;
end $$;
