-- Endurecimiento del acceso anónimo, previo a exponer *.comerz.app.
--
-- Contexto: la anon key es pública (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) y el
-- slug del tenant viaja en un header que el cliente elige. O sea: TODO lo que
-- el rol `anon` pueda leer es público para los 4 negocios a la vez, con un
-- curl. No alcanza con que la UI no lo muestre.
--
-- La auditoría encontró cuatro cosas, de peor a menos peor:
--
--   1. Cuatro tablas `_backup_*` con RLS APAGADO y GRANT de SELECT/INSERT/
--      UPDATE a anon: cualquiera podía leerlas Y ESCRIBIRLAS. YA RESUELTO en
--      20260811150000 (las tres de broderie al schema `archivo`, la de
--      perfiles dropeada), porque no dependía del deploy del código.
--   2. `productos.precio_costo` y `producto_variantes.costo` legibles por anon
--      — el margen de los 1.116 productos de Evens, los 506 de Estilo Bonito y
--      los demás. El catálogo público incluso los pide explícitamente.
--   3. Policies `{public} SELECT USING (true)` que se OR-ean con las policies
--      filtradas de anon y las anulan: `categorias` tenía una con `activa=true`
--      y otra con `true`, así que ganaba `true`. Mismo patrón en `productos`
--      (los 2 productos no publicados de Ninja Camisetas se veían).
--   4. GRANT de INSERT/UPDATE/DELETE a anon en prácticamente toda la base. Hoy
--      lo frena la ausencia de policy permisiva, o sea UNA sola capa: cualquier
--      policy nueva mal escrita se convierte en escritura anónima.
--
-- Criterio: fail-closed. Se revoca todo a anon y se devuelve, columna por
-- columna, exactamente lo que el catálogo público necesita mostrar.
--
-- OJO: esta migración va JUNTO con el cambio de app que reemplaza los
-- `select("*")` sobre configuracion_pos y productos por listas explícitas de
-- columnas. Con GRANT por columna, un `select *` de PostgREST es 403.

begin;

-- ---------------------------------------------------------------------------
-- 1. Piso: anon no escribe nada y no lee nada.
--
-- Se revoca sobre TODAS las tablas del schema y después se devuelve solo lo
-- del catálogo. Es al revés de como estaba (todo abierto, RLS tapando) y es la
-- única forma de que una tabla nueva no quede expuesta por olvido.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- Que la próxima tabla nazca cerrada para anon. Sin esto, el default de
-- Supabase vuelve a otorgar todo y la auditoría hay que rehacerla entera.
do $$
begin
  execute 'alter default privileges in schema public revoke all on tables from anon';
exception when others then
  raise notice 'No se pudieron cambiar los default privileges de anon: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Se limpian las policies `{public} ... USING (true)`.
--
-- El rol `public` incluye a anon: una permisiva con `true` se OR-ea con la
-- policy filtrada de anon y la deja sin efecto. Se reemplazan por policies
-- explícitas por rol. Las de `{authenticated}` no se tocan salvo donde la
-- policy `{public}` era la ÚNICA que le daba SELECT (configuracion_pos).
-- ---------------------------------------------------------------------------

-- productos: anon solo ve lo PUBLICADO.
drop policy if exists "Lectura pública de productos" on public.productos;
create policy productos_select_anon on public.productos
  for select to anon
  using (publicado = true);

-- producto_variantes: anon solo ve las variantes ACTIVAS.
drop policy if exists "Lectura pública de producto_variantes" on public.producto_variantes;
create policy producto_variantes_select_anon on public.producto_variantes
  for select to anon
  using (activa = true);

-- productos_stock (espejo legacy): el catálogo muestra disponibilidad.
drop policy if exists "Lectura pública de stock" on public.productos_stock;
create policy productos_stock_select_anon on public.productos_stock
  for select to anon
  using (true);

-- categorias: quedaba la duplicada con `true`, que anulaba el filtro `activa`.
drop policy if exists "Permitir lectura publica de categorias" on public.categorias;
-- Sobrevive "Permitir lectura pública de categorias" ({anon}, activa = true).

-- producto_variante_valores: no lo consume ningún camino del catálogo público
-- (solo la app autenticada y los scripts). Se cierra para anon.
drop policy if exists "Lectura pública de producto_variante_valores" on public.producto_variante_valores;

-- configuracion_pos: la policy `{public}` era también la única fuente de
-- SELECT para authenticated. Se parte en dos, una por rol.
drop policy if exists "Lectura publica de configuracion" on public.configuracion_pos;
create policy configuracion_pos_select_auth on public.configuracion_pos
  for select to authenticated
  using (true);
create policy configuracion_pos_select_anon on public.configuracion_pos
  for select to anon
  using (true);

-- promociones y sus tablas hijas: anon solo ve las activas.
-- No se filtra por `mostrar_en_catalogo` a propósito: ese eje decide qué se
-- MUESTRA como cartel, no qué se aplica al total del carrito, y el cálculo del
-- descuento del carrito público necesita las dos. (Ver el bloque de
-- promociones en CLAUDE.md: condición y visibilidad son ejes independientes.)
drop policy if exists "Lectura pública de promociones" on public.promociones;
create policy promociones_select_anon on public.promociones
  for select to anon
  using (activa = true);

drop policy if exists "Lectura pública de promociones_productos" on public.promociones_productos;
create policy promociones_productos_select_anon on public.promociones_productos
  for select to anon using (true);

drop policy if exists "Lectura pública de promociones_categorias" on public.promociones_categorias;
create policy promociones_categorias_select_anon on public.promociones_categorias
  for select to anon using (true);

drop policy if exists "Lectura pública de promociones_metodos_pago" on public.promociones_metodos_pago;
create policy promociones_metodos_pago_select_anon on public.promociones_metodos_pago
  for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 3. Se devuelve el SELECT, columna por columna.
--
-- Cada tabla de acá tiene además su RESTRICTIVE `aislamiento_negocio_publico`
-- (negocio_id = security.negocio_publico()), que es lo que impide que el
-- catálogo de un negocio vea los datos de otro. Sin header de slug la función
-- devuelve NULL y la comparación da NULL: sin slug no hay tienda.
-- ---------------------------------------------------------------------------

-- negocios: lo mínimo para resolver slug -> negocio (shared/lib/tenant.ts).
-- Esta tabla NO lleva restrictive por slug porque la consulta que la lee es
-- justamente la que todavía no sabe qué slug es. Consecuencia asumida: anon
-- puede enumerar los negocios activos (id, nombre, slug, logo). Son datos que
-- ya son públicos — el slug ES la URL de la tienda.
grant select (id, nombre, slug, logo_url, estado) on public.negocios to anon;

-- configuracion_pos: branding y datos de contacto de la tienda.
-- Quedan FUERA: cuit, razon_social, condicion_iva, inicio_actividades,
-- punto_venta, modo_facturacion, comprobante_defecto (identidad fiscal del
-- comercio), cc_* y recargo_mora_* (su política de crédito), modo_caja,
-- requiere_caja_abierta, crm_dias_inactivo y mensaje_ticket (operación
-- interna). Nada de eso lo necesita un visitante.
grant select (
  id, negocio_id, "posName", "posLogo", rubro,
  catalogo_activo, mostrar_precios, mostrar_sin_stock, permitir_venta_sin_stock,
  banner_activo, banner_titulo, banner_subtitulo, banner_imagen,
  banner_link, banner_boton_texto,
  marquee_activo, marquee_texto,
  whatsapp, pedidos_whatsapp, instagram, facebook,
  horario_texto, horario_visible,
  direccion, direccion_visible, localidad, localidad_negocio, provincia,
  envio_costo_local, envio_mensaje_lejos, entrega_minima_bloqueante
) on public.configuracion_pos to anon;

-- categorias.
grant select (
  id, negocio_id, nombre, slug, descripcion, imagen_url,
  orden, parent_id, activa
) on public.categorias to anon;

-- productos: SIN precio_costo (el margen) ni id_master (trazabilidad interna
-- al catálogo maestro). Tampoco los campos fiscales, que no se muestran.
grant select (
  id, negocio_id, nombre, slug, tipo, categoria_id, precio,
  descripcion, cuidados, marca, modelo, genero, atributos_globales,
  imagen_url, thumbnail_url, grid_url, publicado, creado_en
) on public.productos to anon;

-- producto_variantes: SIN costo ni stock_minimo (reposición interna).
grant select (
  id, negocio_id, producto_id, sku, nombre_display,
  precio, stock, atributos, activa
) on public.producto_variantes to anon;

-- productos_stock: espejo legacy, solo cantidades.
grant select (id, negocio_id, producto_id, variante, cantidad)
  on public.productos_stock to anon;

-- promociones: SIN creado_por (usuario interno) ni limite_usos/usos_actuales.
grant select (
  id, negocio_id, nombre, descripcion, activa, acumulable,
  tipo_descuento, valor_descuento, tipo_regla, monto_minimo,
  mostrar_en_catalogo, prioridad, fecha_inicio, fecha_fin
) on public.promociones to anon;

grant select (id, negocio_id, promocion_id, producto_id)
  on public.promociones_productos to anon;
grant select (id, negocio_id, promocion_id, categoria_nombre)
  on public.promociones_categorias to anon;
grant select (id, negocio_id, promocion_id, metodo_pago)
  on public.promociones_metodos_pago to anon;

-- metodos_pago: se restablece el mismo recorte que ya existía. `comision` (lo
-- que el comercio le paga al procesador) NO se expone; `recargo_porcentaje`
-- (lo que se le cobra al cliente) sí, porque se avisa antes de comprar.
grant select (id, nombre, tipo, activo, recargo_porcentaje)
  on public.metodos_pago to anon;

-- reservas: el catálogo la consulta para descontar reservas del stock
-- disponible. anon no tiene policy, así que devuelve CERO filas — el GRANT se
-- mantiene sólo para que siga siendo una lista vacía y no un 403 en la tienda
-- en producción. La consecuencia (el catálogo público no descuenta reservas)
-- es un bug funcional preexistente, anotado aparte.
grant select (id, negocio_id, variante_id, estado) on public.reservas to anon;

-- solicitudes_comercio: el formulario "quiero Comerz" de la landing. INSERT y
-- nada más — sin SELECT, para que nadie liste los comercios que se anotaron.
grant insert (
  nombre_comercio, nombre_contacto, whatsapp, rubro, rubro_otro, notas
) on public.solicitudes_comercio to anon;

commit;

-- ---------------------------------------------------------------------------
-- Confirmación explícita de lo que anon NO puede leer después de esto:
--
--   ventas, ventas_items, ventas_descuentos, venta_pagos, comprobantes,
--   comprobante_numeracion, clientes, cuenta_corriente_movimientos,
--   turnos_caja, egresos, perfiles, usuarios_negocios, roles, rol_permisos,
--   permisos, invitaciones, planes, bajas, reservas (0 filas),
--   ordenes_compra, ordenes_items, diccionario_alias, importaciones_productos,
--   unidades_serie (IMEI), actualizaciones_precio(_items),
--   producto_variantes_auditoria, atributos, atributo_valores,
--   categoria_atributos, producto_variante_valores, solicitudes_comercio,
--   y las cuatro _backup_*.
--
-- Ninguna tiene GRANT de SELECT para anon y, salvo las de backup, todas tienen
-- RLS encendido. Son dos capas, no una.
-- ---------------------------------------------------------------------------
