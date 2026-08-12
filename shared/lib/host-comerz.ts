/**
 * A qué le está pegando el visitante: al panel privado, a la landing, o a la
 * tienda de un negocio. Un solo deploy sirve las tres cosas y lo único que las
 * separa es el host, así que la clasificación tiene que vivir en UN lugar y ser
 * pura: el middleware la usa para rutear y los tests para probarla sin DNS.
 *
 *   app.comerz.app      -> panel privado (comportamiento de siempre)
 *   comerz.app / www.   -> landing
 *   evens.comerz.app    -> catálogo público de negocios.slug = 'evens'
 *
 * Sin NEXT_PUBLIC_ROOT_DOMAIN no hay wildcard todavía, y entonces NADA se
 * clasifica como landing: se cae al modo por path (/store/evens), que es el que
 * funciona en cualquier deploy. Es a propósito y es fail-safe — si la variable
 * se olvida en producción, el panel sigue sirviéndose, no se lo come la landing.
 */

import { ROOT_DOMAIN } from "./dominios";
import { SLUGS_RESERVADOS, validarSlugNegocio } from "./slug-negocio";

export type DestinoHost =
  | { tipo: "app" }
  | { tipo: "landing" }
  | { tipo: "tienda"; slug: string };

/**
 * Cómo se está sirviendo el catálogo, según lo resolvió el middleware. Va como
 * header y no se recalcula en la página porque el override de desarrollo puede
 * hacer que el host diga "panel" y el ruteo diga "tienda": dos lugares
 * decidiendo lo mismo terminan generando links que no coinciden con la URL.
 */
export const HEADER_MODO_CATALOGO = "x-comerz-modo";

export type ModoCatalogo = "subdominio" | "path";

/** Header y query param para probar un subdominio sin tener el DNS armado. */
export const HEADER_TIENDA_DEV = "x-comerz-tienda";
export const PARAM_TIENDA_DEV = "tienda";
export const COOKIE_TIENDA_DEV = "comerz_tienda_dev";

/** Quita el puerto y normaliza. `Host` viene con el puerto en desarrollo. */
export function normalizarHost(host: string | null | undefined): string {
  return (host ?? "").split(":")[0].trim().toLowerCase();
}

/**
 * Hosts donde se permite forzar la tienda por header/query/cookie.
 *
 * El override es una llave para cambiar de tenant sin cambiar de dominio, así
 * que en producción NO existe: honrarlo ahí sería dejar que un header elegido
 * por el visitante decida qué catálogo se sirve. En localhost y en los previews
 * de Vercel no hay wildcard que valga, y sin esto no se puede probar el ruteo
 * hasta después de tocar el DNS.
 */
export function esHostDeDesarrollo(host: string | null | undefined): boolean {
  const limpio = normalizarHost(host);
  if (!limpio) return false;

  return (
    limpio === "localhost" ||
    limpio.endsWith(".localhost") ||
    limpio === "127.0.0.1" ||
    limpio === "0.0.0.0" ||
    limpio === "[::1]" ||
    limpio.endsWith(".vercel.app") ||
    // IPs de LAN: se entra desde el celular durante el desarrollo.
    /^(10|127)\.\d+\.\d+\.\d+$/.test(limpio) ||
    /^192\.168\.\d+\.\d+$/.test(limpio) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(limpio)
  );
}

/** El subdominio es de un negocio solo si podría haberse dado de alta. */
function esEtiquetaDeNegocio(etiqueta: string): boolean {
  if (!etiqueta || etiqueta.includes(".")) return false;
  if (SLUGS_RESERVADOS.has(etiqueta)) return false;
  return validarSlugNegocio(etiqueta).valido;
}

export interface OpcionesClasificacion {
  /** Slug forzado (header, query o cookie). Solo se honra en hosts de dev. */
  overrideTienda?: string | null;
}

export function clasificarHost(
  host: string | null | undefined,
  { overrideTienda }: OpcionesClasificacion = {},
): DestinoHost {
  const limpio = normalizarHost(host);

  // El override manda sobre todo, pero solo donde no hay DNS que resolver.
  if (overrideTienda && esHostDeDesarrollo(limpio)) {
    const slug = overrideTienda.trim().toLowerCase();
    if (esEtiquetaDeNegocio(slug)) return { tipo: "tienda", slug };
  }

  if (!limpio) return { tipo: "app" };

  if (ROOT_DOMAIN) {
    const raiz = ROOT_DOMAIN.toLowerCase();

    if (limpio === raiz || limpio === `www.${raiz}`) return { tipo: "landing" };
    if (!limpio.endsWith(`.${raiz}`)) return { tipo: "app" };

    const etiqueta = limpio.slice(0, -(raiz.length + 1));
    return esEtiquetaDeNegocio(etiqueta)
      ? { tipo: "tienda", slug: etiqueta }
      : { tipo: "app" };
  }

  // Sin wildcard: se conserva el comportamiento anterior (cualquier subdominio
  // de tres etiquetas que no sea reservado ni un preview es una tienda), porque
  // es lo que hoy resuelve el catálogo en los deploys que ya están arriba.
  if (esHostDeDesarrollo(limpio)) return { tipo: "app" };

  const partes = limpio.split(".");
  if (partes.length < 3) return { tipo: "app" };

  return esEtiquetaDeNegocio(partes[0])
    ? { tipo: "tienda", slug: partes[0] }
    : { tipo: "app" };
}
