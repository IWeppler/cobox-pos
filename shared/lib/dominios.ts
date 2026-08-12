/**
 * Dónde vive cada cosa. Hoy todo sale del mismo deploy de Vercel; el día que
 * exista el wildcard *.comerz.app, se define NEXT_PUBLIC_ROOT_DOMAIN y los
 * links de catálogo pasan solos a subdominio sin tocar código.
 *
 * A propósito NO hay default de dominio de producción: sin la variable, se
 * asume el modo por path, que funciona en cualquier deploy.
 */

/** Dominio raíz para catálogos por subdominio. Vacío = todavía no hay wildcard. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim() || null;

export const WILDCARD_HABILITADO = Boolean(ROOT_DOMAIN);

/** URL del backoffice y de todo lo que no sea catálogo. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

/**
 * Ruta interna del catálogo. Es SIEMPRE por path, incluso sirviendo desde un
 * subdominio: así los links de la app no dependen del modo de despliegue.
 */
export function rutaCatalogo(slugNegocio: string, slugProducto?: string) {
  return slugProducto
    ? `/store/${slugNegocio}/${slugProducto}`
    : `/store/${slugNegocio}`;
}

/**
 * Ruta de un link DENTRO del catálogo, según cómo se lo esté sirviendo.
 *
 * Sirviendo desde un subdominio la ruta interna nunca se muestra, así que los
 * links tampoco pueden nombrarla: en `evens.comerz.app` el producto es
 * `/campera-negra`. Con un href a `/store/evens/campera-negra` el primer click
 * filtraría la ruta interna a la barra de direcciones (el middleware lo
 * redirige, pero el link copiado ya salió mal).
 */
export function rutaCatalogoEnModo(
  modo: "subdominio" | "path",
  slugNegocio: string,
  slugProducto?: string,
) {
  if (modo === "subdominio") return slugProducto ? `/${slugProducto}` : "/";
  return rutaCatalogo(slugNegocio, slugProducto);
}

/**
 * URL absoluta para compartir (WhatsApp, Open Graph). Con wildcard usa el
 * subdominio del negocio; sin wildcard, el path sobre el dominio del sitio.
 */
export function urlDeCatalogo(slugNegocio: string, slugProducto?: string) {
  if (WILDCARD_HABILITADO) {
    // En el subdominio el producto cuelga de la raíz. Este link es EL que se
    // manda por WhatsApp: si llevara la ruta interna, la ruta interna sería lo
    // que queda pegado en mil chats.
    const base = `https://${slugNegocio}.${ROOT_DOMAIN}`;
    return slugProducto ? `${base}/${slugProducto}` : base;
  }

  // En el navegador el origen real gana sobre la variable: en desarrollo se
  // entra por IP de LAN desde el celular y el link tiene que apuntar ahí.
  const base =
    typeof window !== "undefined" ? window.location.origin : SITE_URL;

  return `${base}${rutaCatalogo(slugNegocio, slugProducto)}`;
}
