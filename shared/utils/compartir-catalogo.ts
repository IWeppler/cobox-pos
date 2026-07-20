// Mismo cap que MAX_PRODUCTOS_SELECCIONADOS en
// features/store/components/store-catalog.tsx — si cambia uno, cambia el
// otro (no hay una sola fuente porque un lado es "cuántos ids acepta la
// URL" y el otro "cuántos ids ofrecemos compartir", pero deben coincidir).
export const MAX_PRODUCTOS_COMPARTIDOS = 30;

export function construirUrlProducto(baseUrl: string, slug: string): string {
  return `${baseUrl}/store/${slug}`;
}

export function construirUrlSeleccion(baseUrl: string, ids: string[]): string {
  const capeados = ids.slice(0, MAX_PRODUCTOS_COMPARTIDOS);
  return `${baseUrl}/store?productos=${capeados.join(",")}`;
}

export function construirUrlCategoria(baseUrl: string, slug: string): string {
  return `${baseUrl}/store?categoria=${slug}`;
}

export interface ProductoVisibilidad {
  publicado: boolean;
  stockTotal: number;
}

export interface ConfigVisibilidadCatalogo {
  mostrarSinStock?: boolean;
}

/**
 * Misma regla que aplica el catálogo público para decidir si un producto
 * aparece listado (features/store/hooks/use-catalog-filters.ts): publicado
 * Y (mostrarSinStock !== false O tiene stock). El detalle individual
 * (/store/[slug]) en los hechos ignora el stock, pero acá se aplica la
 * misma regla combinada en los tres puntos de entrada (individual,
 * selección, categoría) por consistencia con lo que la clienta ve
 * navegando el catálogo — no por una restricción técnica del link.
 */
export function esVisibleEnCatalogo(
  producto: ProductoVisibilidad,
  config: ConfigVisibilidadCatalogo,
): boolean {
  if (!producto.publicado) return false;
  if (config.mostrarSinStock === false && producto.stockTotal <= 0) {
    return false;
  }
  return true;
}

export function puedeCompartirNativo(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

export interface DatosCompartir {
  title: string;
  text: string;
  url: string;
}

/**
 * true si se disparó la hoja nativa (compartido o cancelado por el
 * usuario — un AbortError no es una falla real). false si el navegador no
 * soporta Web Share o el share falló por otra razón, y el llamador debe
 * caer al fallback.
 */
export async function compartirNativo(datos: DatosCompartir): Promise<boolean> {
  if (!puedeCompartirNativo()) return false;

  try {
    await navigator.share(datos);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return true;
    return false;
  }
}

export function armarMensajeProducto(
  nombre: string,
  precioFormateado: string,
): string {
  return `${nombre} — ${precioFormateado}`;
}

export function armarMensajeSeleccion(
  cantidad: number,
  nombreComercio: string,
): string {
  return `${cantidad} producto${cantidad === 1 ? "" : "s"} de ${nombreComercio}`;
}

export function armarMensajeCategoria(nombreCategoria: string): string {
  return nombreCategoria;
}

export function construirLinkWhatsApp(mensaje: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${mensaje} ${url}`)}`;
}
