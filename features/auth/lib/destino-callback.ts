/**
 * A dónde puede mandar el `?next=` de `/auth/callback`.
 *
 * Es la única decisión con criterio que quedó en ese handler, y es de
 * seguridad: `next` viaja en la URL del mail, o sea que lo puede escribir
 * cualquiera. Sin filtro, `/auth/callback?next=https://otro-sitio` es un
 * redirect abierto — un link con NUESTRO dominio, que además acaba de crear una
 * sesión, y que termina en el sitio de otro.
 *
 * Vive acá y no adentro del route handler para poder probar los casos que
 * importan sin levantar un servidor: `//` es el que se escapa de la intuición
 * (`//evil.com` es una URL absoluta protocol-relative y `startsWith("/")` la
 * deja pasar).
 */

/** El default: el paso que le falta a quien acaba de confirmar su cuenta. */
export const DESTINO_POR_DEFECTO = "/onboarding";

export function destinoSeguro(next: string | null | undefined): string {
  if (!next) return DESTINO_POR_DEFECTO;

  // Una ruta interna arranca con UNA barra. Dos es protocol-relative, que el
  // navegador resuelve como host externo.
  if (!next.startsWith("/") || next.startsWith("//")) {
    return DESTINO_POR_DEFECTO;
  }

  // `\` lo normalizan a `/` varios navegadores, así que `/\evil.com` termina
  // siendo lo mismo que `//evil.com`.
  if (next.startsWith("/\\")) return DESTINO_POR_DEFECTO;

  return next;
}
