/**
 * Negocio activo de la sesión, para el panel (no para el catálogo público,
 * que se resuelve por subdominio — ver negocio-slug.ts).
 *
 * Un usuario puede pertenecer a varios negocios: la elección queda en la
 * cookie y viaja a PostgREST como header, porque supabase-js habla con otro
 * origen y las cookies del navegador no llegan.
 *
 * La cookie NO es una credencial: security.current_negocio_id() valida contra
 * usuarios_negocios, así que apuntarla a un negocio ajeno no devuelve nada.
 * Por eso tampoco es httpOnly — el cliente de browser necesita leerla.
 */

export const COOKIE_NEGOCIO_ACTIVO = "negocio_activo_id";
export const HEADER_NEGOCIO_ACTIVO = "x-negocio-activo";

/**
 * Modo Dios: el super admin de Comerz mirando el negocio de un cliente. Viaja
 * por el mismo camino que el negocio activo —cookie en el navegador, header
 * hacia PostgREST— y la base solo lo honra si security.is_super_admin(): para
 * cualquier otro, mandarlo a mano no hace nada.
 */
export const COOKIE_IMPERSONATE = "impersonate_negocio_id";
export const HEADER_IMPERSONATE = "x-impersonate-negocio";

/** 30 días, igual que la sesión larga del POS. */
export const COOKIE_NEGOCIO_MAX_AGE = 60 * 60 * 24 * 30;

export function leerCookie(
  cookieHeader: string | null | undefined,
  nombreBuscado: string,
): string | null {
  if (!cookieHeader) return null;

  for (const parte of cookieHeader.split(";")) {
    const [nombre, ...resto] = parte.trim().split("=");
    if (nombre === nombreBuscado) {
      return decodeURIComponent(resto.join("=")) || null;
    }
  }
  return null;
}

export function leerCookieNegocioActivo(
  cookieHeader: string | null | undefined,
): string | null {
  return leerCookie(cookieHeader, COOKIE_NEGOCIO_ACTIVO);
}
