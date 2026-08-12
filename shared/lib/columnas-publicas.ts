/**
 * Qué columnas puede pedir el catálogo público.
 *
 * Con GRANT por columna para `anon` (20260811140000_rls_anon_catalogo_publico),
 * un `select("*")` de PostgREST pide TODAS las columnas y vuelve 403: la
 * tienda entera se cae, no se degrada. Así que las listas viven acá, en un
 * solo lugar, y son el espejo exacto de los GRANT de esa migración.
 *
 * Regla al tocar esto: agregar una columna acá sin agregarla al GRANT rompe la
 * tienda en producción; agregarla al GRANT sin pensarla la publica para los
 * cuatro negocios a la vez, porque la anon key es pública. Los dos lados se
 * cambian juntos o no se cambia ninguno.
 *
 * Van en UNA línea a propósito: los tipos generados de supabase-js parsean el
 * string del select en tiempo de compilación y un salto de línea dentro de una
 * interpolación le da ParserError.
 */

/** Ojo: sin `precio_costo`. El margen no sale al catálogo. */
export const COLUMNAS_PRODUCTO_PUBLICO =
  "id, negocio_id, nombre, slug, tipo, categoria_id, precio, descripcion, cuidados, marca, modelo, genero, atributos_globales, imagen_url, thumbnail_url, grid_url, publicado, creado_en";

/** Ojo: sin `costo` ni `stock_minimo`. */
export const COLUMNAS_VARIANTE_PUBLICA =
  "id, sku, nombre_display, precio, stock, atributos";

export const COLUMNAS_CATEGORIA_PUBLICA =
  "id, negocio_id, nombre, slug, descripcion, imagen_url, orden, parent_id, activa";

/** Branding y contacto. Sin identidad fiscal ni política de crédito. */
export const COLUMNAS_CONFIG_PUBLICA =
  "id, negocio_id, posName, posLogo, rubro, catalogo_activo, mostrar_precios, mostrar_sin_stock, permitir_venta_sin_stock, banner_activo, banner_titulo, banner_subtitulo, banner_imagen, banner_link, banner_boton_texto, marquee_activo, marquee_texto, whatsapp, pedidos_whatsapp, instagram, facebook, horario_texto, horario_visible, direccion, direccion_visible, localidad, localidad_negocio, provincia, envio_costo_local, envio_mensaje_lejos, entrega_minima_bloqueante";

export const COLUMNAS_PROMOCION_PUBLICA =
  "id, negocio_id, nombre, descripcion, activa, acumulable, tipo_descuento, valor_descuento, tipo_regla, monto_minimo, mostrar_en_catalogo, prioridad, fecha_inicio, fecha_fin";
