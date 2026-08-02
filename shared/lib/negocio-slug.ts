/**
 * Resolución del negocio a partir del host, para el catálogo público
 * multi-tenant: evens.comerz.app sirve el catálogo de negocios.slug = 'evens'.
 *
 * El slug viaja al server en el header x-negocio-slug y lo consume la policy
 * de RLS security.negocio_publico(). Si no hay slug, la base cae al negocio
 * único mientras exista uno solo (ver la migración del paso 5).
 */

export const HEADER_NEGOCIO_SLUG = "x-negocio-slug";

/** Hosts que nunca representan a un negocio. */
const HOSTS_SIN_NEGOCIO = new Set(["www", "app", "admin", "localhost"]);

export function slugDesdeHost(host: string | null | undefined): string | null {
  if (!host) return null;

  const limpio = host.split(":")[0].toLowerCase();
  const partes = limpio.split(".");

  // Un dominio de dos etiquetas (comerz.app) o un host plano (localhost) no
  // tiene subdominio: es el sitio principal, no la tienda de un negocio.
  if (partes.length < 3) return null;

  // Los previews de Vercel son comerz-pos-git-rama-cuenta.vercel.app: el
  // primer segmento es el deploy, no un negocio.
  if (limpio.endsWith(".vercel.app")) return null;

  const sub = partes[0];
  if (!sub || HOSTS_SIN_NEGOCIO.has(sub)) return null;

  return sub;
}
