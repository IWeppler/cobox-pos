import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createPublicClientParaSlug } from "@/shared/config/supabase/server";
import { traerProductosPublicos } from "@/shared/actions/store-actions";

/**
 * Cache del catálogo público, por negocio.
 *
 * Por qué: `store/[negocio]/page.tsx` es `force-dynamic` (resuelve el tenant
 * desde `headers()`), así que CADA visita re-ejecutaba el fetch entero de los
 * ~1.100 productos con sus variantes y volvía a renderizar. Eso es lo que se
 * come el Fluid Active CPU de Vercel, y además paga el egress del JSON de
 * Supabase una vez por visitante. El catálogo de una tienda cambia unas pocas
 * veces por día; servirlo recién horneado a cada visita es trabajo tirado.
 *
 * ─── LA REGLA QUE NO SE PUEDE ROMPER ───────────────────────────────────────
 * El `negocio_id` va SIEMPRE en la clave del cache. Es una base multi-tenant y
 * esta consulta devuelve el catálogo de UN comercio: una clave que no lo
 * incluya hace que el primero que entre caliente el cache y los demás vean SUS
 * productos. Es el peor bug posible acá — no rompe nada visible, simplemente
 * un comercio ve la mercadería y los precios de otro.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Lo que NO se cachea, a propósito:
 *
 * - `conCostos: true` (la terminal del POS). Ahí el stock tiene que estar
 *   fresco: una vendedora vendiendo contra un stock de hace un minuto es una
 *   venta mal cobrada. El POS ya tiene su propio staleTime de React Query, que
 *   es del lado del cliente y se invalida al vender.
 * - Cualquier cosa con sesión. Adentro de `unstable_cache` no se puede leer
 *   `cookies()`, y por buenos motivos: sería cachear datos de un usuario y
 *   servírselos a otro.
 */

/** TTL de respaldo. La invalidación real es por tag; esto es el techo. */
const SEGUNDOS = 60;

/**
 * Tag por negocio. Lo usan las actions que escriben catálogo para que el cambio
 * se vea al toque en vez de esperar el TTL — cuando la dueña publica un
 * producto y no lo ve, asume que se rompió.
 */
export const tagCatalogo = (negocioId: string) => `catalogo:${negocioId}`;

/**
 * Productos publicados de un negocio, cacheados.
 *
 * `slug` es para la RLS (viaja como header a PostgREST) y `negocioId` para la
 * identidad del cache. Son dos cosas distintas y las dos hacen falta: el slug
 * puede cambiar (es editable), el id no — por eso la clave va por id.
 */
export function getProductosPublicosCacheados(slug: string, negocioId: string) {
  return unstable_cache(
    async () => {
      const supabase = createPublicClientParaSlug(slug);
      return traerProductosPublicos(supabase, { conCostos: false });
    },
    // Partes de la clave. `negocioId` no es decorativo: ver la regla de arriba.
    ["catalogo-productos", negocioId],
    { tags: [tagCatalogo(negocioId)], revalidate: SEGUNDOS },
  )();
}

/**
 * Invalida el catálogo de un negocio. Se llama desde toda action que cambie lo
 * que la vidriera muestra: alta, edición, borrado, publicar/despublicar,
 * importación y carga rápida.
 *
 * OJO: `revalidatePath("/store", "layout")` —que ya estaba en esas actions— NO
 * alcanza. Limpia el render cacheado de una ruta, pero no toca una entrada de
 * `unstable_cache`; para eso está el tag. Las dos conviven.
 */
export function invalidarCatalogo(negocioId: string | null | undefined) {
  if (!negocioId) return;
  // El segundo argumento es nuevo en Next 16: dice hasta qué antigüedad se
  // considera vencida la entrada. "max" = purgar sin importar la edad, que es
  // lo que queremos — la dueña acaba de tocar el catálogo y tiene que verlo.
  revalidateTag(tagCatalogo(negocioId), "max");
}

/**
 * Igual que `invalidarCatalogo` pero resolviendo el negocio desde la sesión.
 *
 * Para las actions que no tienen el id a mano. Cuesta un RPC —despreciable al
 * lado de lo que acaban de escribir— y evita el bug de olvidarse de invalidar
 * por no querer cablear el id hasta ahí.
 */
export async function invalidarCatalogoDeSesion(supabase: {
  rpc: (fn: "negocio_actual") => PromiseLike<{ data: string | null }>;
}) {
  const { data } = await supabase.rpc("negocio_actual");
  invalidarCatalogo(data);
}
