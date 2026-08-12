import type { createClient } from "@/shared/config/supabase/server";
import { parseProductImages } from "./stock-product-utils";

type SupabaseServerClient = ReturnType<typeof createClient>;

/** Bucket donde viven las imágenes de producto (main, thumbs, grids, masters). */
const BUCKET = "productos";

/**
 * Convierte la URL pública de Storage en el path interno del bucket.
 *
 *   https://<ref>.supabase.co/storage/v1/object/public/productos/<negocio>/<archivo>
 *                                                              └──── esto ────┘
 *
 * Devuelve null ante cualquier cosa que no sea exactamente eso. Es a propósito
 * y es la parte delicada del borrado: un parseo permisivo que devuelva un path
 * equivocado no falla ruidoso, borra el archivo de otro. Ante la duda, no se
 * borra nada y queda un huérfano — que es el estado en el que ya estábamos.
 */
export function pathDesdeUrlPublica(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;

  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  if (i < 0) return null;

  // Sin querystring ni fragmento: Storage los ignora, pero formarían parte del
  // path y la baja no matchearía nada.
  const path = url.slice(i + marca.length).split(/[?#]/)[0];
  if (!path) return null;

  // Un path relativo con ".." podría apuntar fuera de la carpeta del negocio.
  // La policy de Storage lo frenaría igual, pero no se manda de entrada.
  if (path.includes("..")) return null;

  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Junta los paths de TODAS las imágenes de estos productos (main, thumbnail,
 * grid y master).
 *
 * Se llama ANTES de borrar los productos: después las URLs ya no existen. Que
 * la lectura y la baja sean dos pasos es lo que permite borrar los archivos
 * solo si el borrado en base salió bien.
 */
export async function recolectarPathsDeImagenes(
  supabase: SupabaseServerClient,
  productIds: string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];

  const { data, error } = await supabase
    .from("productos")
    .select("imagen_url, thumbnail_url, grid_url, master_url")
    .in("id", productIds);

  if (error) {
    // No es motivo para abortar el borrado: el producto se borra igual y a lo
    // sumo quedan huérfanos, que es exactamente lo que pasaba antes.
    console.error("[BORRAR IMAGENES] No se pudieron leer las URLs:", error);
    return [];
  }

  const paths = new Set<string>();
  for (const fila of data ?? []) {
    for (const columna of [
      fila.imagen_url,
      fila.thumbnail_url,
      fila.grid_url,
      fila.master_url,
    ]) {
      for (const url of parseProductImages(columna)) {
        const path = pathDesdeUrlPublica(url);
        if (path) paths.add(path);
      }
    }
  }

  // Set y no array: thumbnail_url y grid_url usan la URL del main como
  // placeholder cuando su versión no subió (ver subirImagenesProducto), así
  // que el mismo path aparece hasta tres veces.
  return [...paths];
}

/**
 * Borra los archivos del bucket. Se llama DESPUÉS de que el borrado en base
 * salió bien: si se hiciera antes y el delete fallara, quedaría un producto
 * vivo apuntando a imágenes que ya no existen — peor que un huérfano, porque
 * se ve roto en la tienda.
 *
 * Nunca lanza ni devuelve error al usuario: el producto ya se borró y eso es
 * lo que pidió. Un archivo que no se pudo borrar es un huérfano más, y queda
 * logueado para poder encontrarlo.
 */
export async function borrarPathsDeStorage(
  supabase: SupabaseServerClient,
  paths: string[],
): Promise<number> {
  if (paths.length === 0) return 0;

  // La API de Storage acepta varios paths por llamada, pero no ilimitados: se
  // manda en lotes para que un borrado masivo de 200 productos (hasta 4
  // imágenes cada uno) no arme un body gigante.
  const TAMANO_LOTE = 100;
  let borradas = 0;

  for (let i = 0; i < paths.length; i += TAMANO_LOTE) {
    const lote = paths.slice(i, i + TAMANO_LOTE);
    const { data, error } = await supabase.storage.from(BUCKET).remove(lote);

    if (error) {
      console.error("[BORRAR IMAGENES] Falló un lote:", {
        cantidad: lote.length,
        error,
      });
      continue;
    }
    borradas += data?.length ?? 0;
  }

  return borradas;
}
