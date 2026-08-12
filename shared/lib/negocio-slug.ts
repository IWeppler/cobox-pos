/**
 * Resolución del negocio a partir del host, para el catálogo público
 * multi-tenant: evens.comerz.app sirve el catálogo de negocios.slug = 'evens'.
 *
 * El slug viaja al server en el header x-negocio-slug y lo consume la policy
 * de RLS security.negocio_publico(). Si no hay slug, la base cae al negocio
 * único mientras exista uno solo (ver la migración del paso 5).
 */

import { clasificarHost } from "./host-comerz";

export const HEADER_NEGOCIO_SLUG = "x-negocio-slug";

/**
 * Slug del negocio que sirve este host, o null si el host no es de una tienda.
 *
 * Es una vista de `clasificarHost`, no una segunda implementación: cuál es el
 * panel, cuál la landing y cuál una tienda se decide en UN lado. Antes esto
 * tenía su propia lista de hosts excluidos y decía cosas distintas que el resto
 * del ruteo.
 */
export function slugDesdeHost(host: string | null | undefined): string | null {
  const destino = clasificarHost(host);
  return destino.tipo === "tienda" ? destino.slug : null;
}
