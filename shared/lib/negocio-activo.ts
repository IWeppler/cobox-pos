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

/** 30 días, igual que la sesión larga del POS. */
export const COOKIE_NEGOCIO_MAX_AGE = 60 * 60 * 24 * 30;

export function leerCookieNegocioActivo(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;

  for (const parte of cookieHeader.split(";")) {
    const [nombre, ...resto] = parte.trim().split("=");
    if (nombre === COOKIE_NEGOCIO_ACTIVO) {
      return decodeURIComponent(resto.join("=")) || null;
    }
  }
  return null;
}
