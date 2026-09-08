-- ---------------------------------------------------------------------------
-- Listas de precios: el mismo producto vendido a distinto precio según a quién.
--
-- QUÉ ES Y QUÉ NO. Una lista responde "¿qué precio corresponde a este tipo de
-- cliente?" y una promoción responde "¿bajo qué condición modifico el precio?".
-- Son dos ejes distintos y por eso son dos subsistemas distintos. Modelar
-- "Mayorista" como una promoción parecía reutilización y era un error, medido
-- sobre este mismo esquema el 8/9/2026:
--
--   * la policy de UPDATE de `promociones` es literalmente `true`/`true` —está
--     abierta a propósito, porque `registrar_venta` incrementa `usos_actuales`
--     con la RLS de la vendedora, y la RLS es por FILA y no por columna. O sea
--     que cualquier vendedora podría editar el precio mayorista desde la
--     consola del navegador.
--   * `promociones_productos` (el candidato natural a "override por producto")
--     tiene `select` para `anon` con `qual: true`. Un precio mayorista ahí
--     sería PÚBLICO.
--   * y esa tabla tiene 0 filas y 0 referencias en el código: no es
--     infraestructura probada, es una tabla muerta con RLS.
--
-- Acá las tres cosas van al revés: escritura solo ADMIN, cero GRANT a `anon`,
-- y el catálogo público no puede verlas ni por error.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ NO HAY UNA LISTA "MINORISTA"
--
-- `productos.precio` YA es el precio minorista. No se siembra ninguna fila
-- base, y "sin lista" se representa con NULL. Es lo que hace que los comercios
-- que no usan esto sigan funcionando exactamente igual POR CONSTRUCCIÓN y no
-- porque un seed haya salido bien: sin filas en estas tablas, no hay ningún
-- camino por el que el precio cambie.
--
-- Consecuencia buscada: esta migración deja las 8 tiendas EXACTAMENTE como
-- estaban. Dos tablas vacías, tres columnas nullables que nadie lee todavía.
-- No hay backfill, no hay default nuevo, no cambia una sola lectura.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ EL OVERRIDE ES A NIVEL PRODUCTO Y NO DE VARIANTE
--
-- Dos motivos, los dos medidos:
--
--   1. En los datos, el precio ES del producto. De 5.904 variantes, 4.583
--      tienen `precio` en null y otras 1.259 lo tienen cargado pero IGUAL al
--      del producto. Solo 62 —el 1,05%— tienen uno propio. Modelar por
--      variante es pagar 5.904 filas para resolver 62 casos.
--   2. `guardar_variantes_producto` BORRA todas las variantes de un producto y
--      las reinserta en cada guardado. Un precio de lista atado a `variante_id`
--      se evaporaría la primera vez que alguien corrige una descripción, sin
--      ningún síntoma: el precio simplemente volvería al base.
--
-- El día que haga falta, `producto_precios` acepta una columna `variante_id`
-- nullable — pero antes hay que resolver el delete+reinsert.
--
-- ---------------------------------------------------------------------------
-- LA REGLA ES LO QUE HACE QUE ESTO SE USE
--
-- Una lista SIN regla obliga al comercio nuevo a cargar a mano un precio
-- mayorista por producto. Con regla carga UN número y ya tiene mayorista sobre
-- todo el catálogo; los overrides quedan para las excepciones, que es lo que
-- hace que la tabla sea rala y que el payload del POS no crezca.
--
-- Y no es una intuición sobre cómo piensan: el 93,1% de los productos de Evens
-- y el 94,4% de los de Estilo Bonito tienen precio exactamente el doble del
-- costo. Estos comercios ya fijan precios por regla.
--
-- Efecto lateral importante: una lista por regla se recalcula sola cuando
-- entra un remito y cambia el precio base. Un override fijo, no — se queda
-- viejo en silencio, que es el mismo bug que ya mordió en `precio-al-asociar`.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Las listas
-- ---------------------------------------------------------------------------

create table if not exists public.listas_precios (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null default security.current_negocio_id(),
  nombre      text not null,

  -- CHECK fail-closed, mismo criterio que `rubro`, `egresos.tipo` y
  -- `modo_facturacion`: agregar una regla nueva (escalas por cantidad, precio
  -- fijo global) exige una migración, que es lo correcto. El código de
  -- `shared/lib/precio-de-lista.ts` cae al precio BASE ante un tipo_regla que
  -- no conoce, así que las dos puntas fallan cerrado.
  tipo_regla  text not null default 'PORCENTAJE'
              check (tipo_regla in ('PORCENTAJE', 'MARKUP')),

  -- PORCENTAJE: ajuste FIRMADO sobre el precio base (-20 = 20% menos,
  --             +15 = 15% más). Firmado y no "descuento" porque una lista no
  --             siempre baja: la de contado y la de crédito son la misma cosa
  --             mirada desde los dos lados.
  -- MARKUP:     multiplicador sobre `productos.precio_costo` (1.5 = costo × 1,5).
  valor       numeric not null default 0,

  -- Si una promoción puede descontar ADEMÁS del precio de lista.
  --
  -- Default FALSE, y es la decisión más cara de esta feature. Sobre un
  -- producto de $20.000 al doble del costo, una lista de −20% más una promo de
  -- 5% deja el margen en 34,2% contra el 50% de partida. Puede ser lo que el
  -- comercio quiere; lo que no puede es pasar sin que nadie lo haya decidido,
  -- que es exactamente lo que pasaría con el default en true.
  admite_promociones boolean not null default false,

  activa      boolean not null default true,
  creado_en   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint listas_precios_nombre_no_vacio
    check (length(trim(nombre)) > 0),

  -- Una regla que da cero o menos no es un precio: es un error de carga. El
  -- CHECK lo impide en la base y `precio-de-lista.ts` igual lo contempla
  -- (REGLA_INVALIDA), porque el redondeo al peso sobre un precio muy chico
  -- todavía puede dar cero.
  constraint listas_precios_valor_coherente check (
    (tipo_regla = 'PORCENTAJE' and valor > -100)
    or (tipo_regla = 'MARKUP' and valor > 0)
  )
);

-- Dos listas con el mismo nombre en un comercio es un error de carga que se
-- descubre tarde y en el mostrador. Por negocio, porque dos comercios sí
-- pueden tener su "Mayorista".
create unique index if not exists uq_listas_precios_nombre
  on public.listas_precios (negocio_id, lower(trim(nombre)));

comment on table public.listas_precios is
  'Listas de precios de un comercio (Mayorista, Distribuidor, …). NO hay fila para el precio minorista: `productos.precio` ya lo es, y "sin lista" se representa con NULL. Una lista es un PRECIO por segmento de cliente; una promoción es un DESCUENTO por condición de venta — ver promociones.';
comment on column public.listas_precios.tipo_regla is
  'PORCENTAJE (ajuste firmado sobre productos.precio) | MARKUP (multiplicador sobre productos.precio_costo). CHECK fail-closed.';
comment on column public.listas_precios.valor is
  'Con PORCENTAJE, el ajuste firmado: -20 es 20% menos. Con MARKUP, el multiplicador sobre el costo: 1.5 es costo x 1,5.';
comment on column public.listas_precios.admite_promociones is
  'Si una promoción puede descontar ADEMAS del precio de lista. Default false: el precio de lista ya es el descuento, y acumular sin decidirlo se come el margen (ver el comentario de la migración).';

alter table public.listas_precios enable row level security;

-- Forma obligatoria del predicado: `negocio_id = (select ...)`, NUNCA
-- `security.same_negocio(negocio_id)`. La segunda recibe la columna como
-- argumento, así que Postgres la ejecuta una vez POR FILA y el índice de
-- negocio_id no se usa — 132 ms contra 4 ms medidos en 20260816100000.
create policy aislamiento_negocio on public.listas_precios
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

-- Leerla la necesita cualquiera que venda: el POS tiene que poder mostrar el
-- chip y calcular el precio.
create policy listas_precios_select on public.listas_precios
  for select to authenticated using (true);

-- Escribirla, solo ADMIN. Es la diferencia deliberada con `promociones`, cuya
-- UPDATE quedó abierta porque la venta le toca `usos_actuales`. A una lista de
-- precios no la escribe ninguna venta, así que no hay motivo para dejar la
-- puerta abierta. El subselect no es decorativo: sin él `is_admin()` se
-- evalúa una vez por fila.
create policy listas_precios_insert_admin on public.listas_precios
  for insert to authenticated with check ((select public.is_admin()));
create policy listas_precios_update_admin on public.listas_precios
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy listas_precios_delete_admin on public.listas_precios
  for delete to authenticated using ((select public.is_admin()));

create trigger trg_listas_precios_updated_at
  before update on public.listas_precios
  for each row execute function public.marcar_updated_at();


-- ---------------------------------------------------------------------------
-- 2. Los overrides por producto
--
-- SOLO EXCEPCIONES. Un comercio cuya lista mayorista es "todo −20%" no tiene
-- ni una fila acá. Eso es lo que mantiene chico el payload del catálogo del
-- POS, que hoy se baja 6.849 veces por día y es el grueso del egress del
-- proyecto.
-- ---------------------------------------------------------------------------

create table if not exists public.producto_precios (
  negocio_id  uuid not null default security.current_negocio_id(),
  lista_id    uuid not null references public.listas_precios(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,

  -- `> 0` y no `>= 0`: un producto a cero no es gratis, está sin cargar. Es el
  -- mismo freno que `precio-de-lista.ts` aplica arriba (SIN_PRECIO_BASE), acá
  -- para que el dato malo no pueda ni entrar.
  precio      numeric not null check (precio > 0),

  updated_at  timestamptz not null default now(),

  primary key (lista_id, producto_id)
);

-- La consulta del carrito es "los overrides de ESTA lista para ESTOS
-- productos". La PK ya cubre (lista_id, producto_id); este índice es para el
-- camino que filtra por negocio, que es el primer filtro de toda consulta una
-- vez que la RLS se resolvió por statement.
create index if not exists idx_producto_precios_negocio_producto
  on public.producto_precios (negocio_id, producto_id);

comment on table public.producto_precios is
  'Precio FIJO de un producto en una lista. Solo excepciones a la regla de la lista: lo normal es que un comercio no tenga ninguna fila acá. El override REEMPLAZA la regla, no se le suma.';
comment on column public.producto_precios.precio is
  'Precio final por unidad para esta lista. Reemplaza la regla entera, incluido el precio propio de una variante.';

alter table public.producto_precios enable row level security;

create policy aislamiento_negocio on public.producto_precios
  as restrictive for all to public
  using (negocio_id = (select security.current_negocio_id()))
  with check (negocio_id = (select security.current_negocio_id()));

create policy producto_precios_select on public.producto_precios
  for select to authenticated using (true);

create policy producto_precios_insert_admin on public.producto_precios
  for insert to authenticated with check ((select public.is_admin()));
create policy producto_precios_update_admin on public.producto_precios
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy producto_precios_delete_admin on public.producto_precios
  for delete to authenticated using ((select public.is_admin()));

create trigger trg_producto_precios_updated_at
  before update on public.producto_precios
  for each row execute function public.marcar_updated_at();


-- ---------------------------------------------------------------------------
-- 3. La lista del cliente: una SUGERENCIA, no una orden
--
-- Mismo criterio que `comprobante_defecto`: si la lista está inactiva o es de
-- otro negocio, gana el precio base. `on delete set null` porque borrar una
-- lista no puede borrar un cliente.
-- ---------------------------------------------------------------------------

alter table public.clientes
  add column if not exists lista_precio_id uuid
  references public.listas_precios(id) on delete set null;

comment on column public.clientes.lista_precio_id is
  'Lista sugerida para este cliente. NULL = precio base. Es una sugerencia: el POS la propone y la vendedora puede cambiarla; quien manda en la venta es ventas.lista_precio_id.';

-- El cliente se busca por lista solo en pantallas de gestión, pero el índice
-- parcial cuesta casi nada: de 260 clientes hoy, cero tienen lista.
create index if not exists idx_clientes_lista_precio
  on public.clientes (negocio_id, lista_precio_id)
  where lista_precio_id is not null;


-- ---------------------------------------------------------------------------
-- 4. La lista de la VENTA, congelada
--
-- SIN FK, y con el nombre al lado. Mismo criterio que `ventas_items.variante_id`
-- y que los datos del receptor en `comprobantes`: el historial tiene que
-- sobrevivir a que la lista se renombre o se borre. Un ticket de ayer tiene que
-- seguir diciendo lo que decía.
--
-- NULL significa "vendida antes de que existieran las listas", y por eso NO se
-- backfillea con nada: rellenar 1.072 ventas con "Minorista" sería inventar un
-- dato que nadie registró.
--
-- Se empieza a llenar desde el día uno aunque todavía no la lea ningún
-- reporte. Es el mismo argumento de `movimientos_stock`: toda métrica de
-- margen se vuelve bimodal cuando conviven dos listas, y segmentarla después
-- solo se puede si la columna estuvo ahí desde el principio. Cada día sin ella
-- es historia que no vuelve.
-- ---------------------------------------------------------------------------

alter table public.ventas
  add column if not exists lista_precio_id uuid;
alter table public.ventas
  add column if not exists lista_precio_nombre text;

comment on column public.ventas.lista_precio_id is
  'Lista con la que se cobró esta venta. SIN FK a proposito: el historial sobrevive a que la lista se borre. NULL = precio base, o venta anterior a las listas de precios.';
comment on column public.ventas.lista_precio_nombre is
  'El nombre que tenia la lista al momento de la venta, congelado. La lista se puede renombrar; el ticket ya emitido no.';


-- ---------------------------------------------------------------------------
-- 5. GUARDS
--
-- Mismo criterio que el guard de policies de 20260816100000 y el del cuerpo
-- vivo de 20260904140000: la migración falla si el resultado no es el que este
-- comentario promete. Lo que no se verifica, se descubre en producción.
-- ---------------------------------------------------------------------------
do $$
declare
  v_faltan   text;
  v_cuenta   integer;
begin
  -- 5.1 CERO privilegios para `anon`. Es LA garantía de que el catálogo
  -- público no puede ver un precio mayorista. `productos` y
  -- `producto_variantes` no tienen grant de TABLA para anon sino de COLUMNA,
  -- así que una tabla nueva sin grant es invisible; esto lo verifica en vez de
  -- confiar en que siga siendo así.
  select count(*) into v_cuenta
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('listas_precios', 'producto_precios')
     and grantee = 'anon';

  if v_cuenta > 0 then
    raise exception
      'Las listas de precios NO pueden estar concedidas a anon (% privilegios encontrados): eso las publicaria en el catalogo.',
      v_cuenta;
  end if;

  -- 5.2 El aislamiento entre negocios usa la forma que aprovecha el índice.
  select string_agg(tablename || '.' || policyname, ', ') into v_faltan
    from pg_policies
   where schemaname = 'public'
     and tablename in ('listas_precios', 'producto_precios')
     and policyname = 'aislamiento_negocio'
     and (qual is null or qual not like '%current_negocio_id%'
          or qual like '%same_negocio%');

  if v_faltan is not null then
    raise exception
      'Policy de aislamiento con la forma vieja (same_negocio o sin current_negocio_id): %', v_faltan;
  end if;

  -- 5.3 Toda escritura pasa por is_admin(). Es la diferencia con promociones,
  -- y es lo que impide que una vendedora edite el precio mayorista desde la
  -- consola del navegador.
  --
  -- Ojo con `pg_policies`: en una policy de INSERT `qual` es SIEMPRE null y en
  -- una de DELETE lo es `with_check`. Por eso se mira el que corresponde a
  -- cada comando y no un coalesce de los dos — ese error ya abortó una
  -- migración correcta en 20260905120000.
  select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ')
    into v_faltan
    from pg_policies
   where schemaname = 'public'
     and tablename in ('listas_precios', 'producto_precios')
     and permissive = 'PERMISSIVE'
     and cmd in ('INSERT', 'UPDATE', 'DELETE')
     and coalesce(
           case cmd when 'DELETE' then qual else with_check end,
           ''
         ) not like '%is_admin%';

  if v_faltan is not null then
    raise exception 'Hay policies de escritura sin is_admin(): %', v_faltan;
  end if;

  -- 5.4 Nada cambió para nadie. Las dos tablas arrancan vacías: si esta
  -- migración dejara una sola fila, algún comercio empezaría a ver precios
  -- distintos sin haberlo pedido.
  select (select count(*) from public.listas_precios)
       + (select count(*) from public.producto_precios)
    into v_cuenta;

  if v_cuenta <> 0 then
    raise exception
      'Las listas de precios tienen que arrancar VACIAS y hay % filas.', v_cuenta;
  end if;
end;
$$;
