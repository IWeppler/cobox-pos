import type { createClient } from "@/shared/config/supabase/server";
import {
  MAX_BYTES_GUARDADOS,
  MAX_BYTES_MASTER,
  MAX_IMAGENES_PRODUCTO,
} from "@/shared/utils/limites-imagen";
import {
  esUrlImagenPropia,
  type UrlsImagenesProducto,
} from "./imagenes-producto-comun";

type SupabaseServerClient = ReturnType<typeof createClient>;

export type { UrlsImagenesProducto };

/**
 * Resuelve las URLs de las imágenes de un producto, por CUALQUIERA de los dos
 * caminos que pueden llegar hoy.
 *
 * 1. `imagenes_urls` — el camino nuevo: el navegador ya subió a Storage y solo
 *    manda URLs. Es el que hace que el guardado no dependa de que varios MB
 *    sobrevivan un POST desde un celular.
 * 2. `imagenes` (los binarios) — el camino viejo, que se mantiene porque
 *    `skipWaiting: false` deja service workers anteriores vivos hasta que se
 *    cierran todas las pestañas. Un cliente cacheado sigue mandando archivos y
 *    tiene que poder guardar igual. Cuando no queden clientes viejos, esta
 *    rama y `subirImagenesProducto` se pueden borrar.
 *
 * Las URLs del camino 1 se VALIDAN una por una: las manda el navegador, así
 * que se comprueba que apunten al bucket de este negocio y no a cualquier
 * lado. Una URL inválida invalida el juego entero — descartar solo esa dejaría
 * los cuatro arrays desalineados, que es el bug que este módulo ya arregló una
 * vez.
 */
export function leerUrlsDeImagenes(
  formData: FormData,
  negocioId: string,
  contexto: "CREATE PRODUCT" | "EDIT PRODUCT",
  /** Cuántas imágenes más admite este producto. El cliente ya lo respeta, pero
   * acá no se confía en el cliente: es el mismo espejo server-side que hace la
   * rama de archivos. */
  cupoDisponible: number = MAX_IMAGENES_PRODUCTO,
): UrlsImagenesProducto | null {
  const crudo = formData.get("imagenes_urls");
  if (typeof crudo !== "string" || crudo === "") return null;

  let payload: UrlsImagenesProducto;
  try {
    payload = JSON.parse(crudo) as UrlsImagenesProducto;
  } catch {
    console.error(`[${contexto}] imagenes_urls ilegible, se ignora.`);
    return null;
  }

  const { mains, thumbs, grids, masters } = payload ?? {};
  if (!Array.isArray(mains) || mains.length === 0) return null;

  // El largo tiene que coincidir: los cuatro arrays se leen por índice.
  if (
    !Array.isArray(thumbs) ||
    !Array.isArray(grids) ||
    !Array.isArray(masters) ||
    thumbs.length !== mains.length ||
    grids.length !== mains.length ||
    masters.length !== mains.length
  ) {
    console.error(`[${contexto}] imagenes_urls desalineado, se ignora.`, {
      mains: mains.length,
      thumbs: Array.isArray(thumbs) ? thumbs.length : null,
      grids: Array.isArray(grids) ? grids.length : null,
      masters: Array.isArray(masters) ? masters.length : null,
    });
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const propia = (u: unknown) => esUrlImagenPropia(u, negocioId, supabaseUrl);

  const tope = Math.max(0, Math.min(cupoDisponible, MAX_IMAGENES_PRODUCTO));
  if (tope === 0) {
    console.warn(`[${contexto}] Sin cupo para imágenes nuevas, se descartan.`);
    return null;
  }

  const limitadas = mains.slice(0, tope);
  for (let i = 0; i < limitadas.length; i++) {
    // El master puede ser null legítimamente; el resto no.
    if (
      !propia(mains[i]) ||
      !propia(thumbs[i]) ||
      !propia(grids[i]) ||
      (masters[i] !== null && !propia(masters[i]))
    ) {
      console.error(`[${contexto}] URL de imagen ajena o inválida, descartadas todas.`, {
        indice: i,
      });
      return null;
    }
  }

  return {
    mains: limitadas,
    thumbs: thumbs.slice(0, tope),
    grids: grids.slice(0, tope),
    masters: masters.slice(0, tope),
  };
}

/**
 * Sube los tríos (main + thumbnail + grid) de un producto a Storage y
 * devuelve las tres listas de URLs GARANTIZADAMENTE alineadas por índice:
 * `mains[i]`, `thumbs[i]` y `grids[i]` corresponden siempre a la misma
 * imagen, y las tres listas tienen el mismo largo.
 *
 * Reemplaza el bucle que estaba duplicado en create-product.ts y
 * edit-product.ts, donde había dos formas de desalinear las listas:
 *
 * 1. El bucle recorría `archivos.filter(f => f.size > 0)` pero indexaba
 *    `thumbnails[i]` / `grids[i]` contra los arrays SIN filtrar. Bastaba un
 *    main de tamaño 0 para que, de ahí en adelante, cada thumbnail quedara
 *    asociado a la imagen equivocada.
 * 2. Cada URL se agregaba con `push` solo si su upload salía bien. Si fallaba
 *    el thumbnail de la primera imagen, `thumbnail_url[0]` pasaba a ser el
 *    thumbnail de la SEGUNDA, y el catálogo mostraba la miniatura de otra
 *    imagen.
 *
 * El criterio ahora: el main manda. Si el main no sube, se descarta el trío
 * entero (no hay imagen que mostrar). Si sube el main pero falla su thumbnail
 * o su grid, se usa la URL del main como placeholder en ese índice — mismo
 * criterio que ya usaba edit-product.ts para las imágenes viejas sin
 * thumbnail: se ve más pesado, pero se ve, y el backfill lo corrige después.
 */
export async function subirImagenesProducto(
  supabase: SupabaseServerClient,
  negocioId: string,
  archivos: File[],
  thumbnails: File[],
  grids: File[],
  contexto: "CREATE PRODUCT" | "EDIT PRODUCT",
  /** Cuántas imágenes más admite este producto. En alta es el tope entero; en
   * edición es lo que queda libre después de contar las que ya tiene. */
  cupoDisponible: number = MAX_IMAGENES_PRODUCTO,
  /** Copias de mayor calidad, para poder regenerar derivadas más adelante.
   * Va último y con default a propósito: un cliente viejo cacheado por el
   * service worker no las manda, y eso tiene que seguir dando de alta el
   * producto igual — sin master, pero dado de alta. */
  masters: File[] = [],
): Promise<UrlsImagenesProducto> {
  const mains: string[] = [];
  const thumbs: string[] = [];
  const grids_: string[] = [];
  const masters_: (string | null)[] = [];

  const publicUrl = (path: string) =>
    supabase.storage.from("productos").getPublicUrl(path).data.publicUrl;

  const subir = async (path: string, file: File) => {
    const { error } = await supabase.storage
      .from("productos")
      .upload(path, file, { cacheControl: "31536000" });
    return error;
  };

  // Recorremos el índice ORIGINAL: es el único que comparten los tres arrays
  // tal como los arma el cliente (un append de main, thumbnail y grid por
  // imagen, en ese orden). Filtrar antes de iterar es justamente lo que
  // rompía la correspondencia.
  for (let i = 0; i < archivos.length; i++) {
    const main = archivos[i];
    if (!main || main.size === 0) continue;

    // Espejo server-side de los límites del picker. El cliente ya los aplica,
    // pero acá no se confía en el cliente: mismo criterio que con los precios
    // en create-sale. Un cliente viejo cacheado por el service worker, o
    // cualquiera que arme el FormData a mano, entra por este camino igual.
    if (mains.length >= cupoDisponible) {
      console.warn(
        `[${contexto}] Imagen ${i} ("${main.name}") descartada: se llegó al máximo de ${MAX_IMAGENES_PRODUCTO} por producto.`,
      );
      continue;
    }

    // Nada sin comprimir debe llegar a Storage. El optimizador apunta a
    // ~0.2MB para el main; 2MB es holgado y solo frena originales crudos.
    if (main.size > MAX_BYTES_GUARDADOS) {
      console.error(
        `[${contexto}] Imagen ${i} ("${main.name}") descartada: ${(main.size / 1024 / 1024).toFixed(1)}MB supera el máximo de ${MAX_BYTES_GUARDADOS / 1024 / 1024}MB para archivos ya optimizados. Llegó sin comprimir.`,
      );
      continue;
    }

    const baseFileName = crypto.randomUUID();
    const mainExt = main.name.split(".").pop();
    const mainPath = `${negocioId}/${baseFileName}.${mainExt}`;

    // Un thumbnail o un grid que pesa como un original es un original: se
    // trata como si no hubiera venido y se cae al placeholder del main.
    const usable = (f: File | undefined): f is File =>
      Boolean(f) && f!.size > 0 && f!.size <= MAX_BYTES_GUARDADOS;

    const thumb = thumbnails[i];
    const grid = grids[i];
    const thumbPath = usable(thumb)
      ? `${negocioId}/thumbs/${baseFileName}-thumb.${thumb.name.split(".").pop()}`
      : null;
    const gridPath = usable(grid)
      ? `${negocioId}/grids/${baseFileName}-grid.${grid.name.split(".").pop()}`
      : null;

    // El master tiene su propio techo (MAX_BYTES_MASTER, más alto): medirlo con
    // la vara de una derivada lo descartaría por ser justamente lo que tiene
    // que ser, la copia más pesada.
    const master = masters[i];
    const masterPath =
      master && master.size > 0 && master.size <= MAX_BYTES_MASTER
        ? `${negocioId}/masters/${baseFileName}-master.${master.name.split(".").pop()}`
        : null;

    if (master && !masterPath) {
      console.warn(
        `[${contexto}] Master descartado para la imagen ${i} ("${main.name}"): ${(master.size / 1024 / 1024).toFixed(1)}MB supera el máximo de ${MAX_BYTES_MASTER / 1024 / 1024}MB.`,
      );
    }

    // Las tres versiones de UNA imagen van en paralelo: son requests
    // independientes a Storage y antes eran 3 round-trips en serie por
    // imagen. Las imágenes entre sí siguen yendo de a una para no abrir
    // demasiadas conexiones simultáneas desde la función.
    const [mainError, thumbError, gridError, masterError] = await Promise.all([
      subir(mainPath, main),
      thumbPath ? subir(thumbPath, thumb) : Promise.resolve(null),
      gridPath ? subir(gridPath, grid) : Promise.resolve(null),
      masterPath ? subir(masterPath, master) : Promise.resolve(null),
    ]);

    if (mainError) {
      console.error(`[${contexto} IMAGE ERROR]`, {
        archivo: main.name,
        indice: i,
        error: mainError,
      });
      // Sin main no hay trío: descartamos también su thumbnail y su grid
      // aunque hayan subido bien, para no dejar un índice sin imagen
      // principal.
      continue;
    }

    const mainUrl = publicUrl(mainPath);
    mains.push(mainUrl);

    if (thumbPath && !thumbError) {
      thumbs.push(publicUrl(thumbPath));
    } else {
      if (thumbError) {
        console.error(`[${contexto} THUMBNAIL ERROR]`, {
          archivo: main.name,
          indice: i,
          error: thumbError,
        });
      } else {
        console.warn(
          `[${contexto}] Sin thumbnail para la imagen ${i} ("${main.name}") — se usa el main como placeholder.`,
        );
      }
      thumbs.push(mainUrl);
    }

    if (gridPath && !gridError) {
      grids_.push(publicUrl(gridPath));
    } else {
      if (gridError) {
        console.error(`[${contexto} GRID ERROR]`, {
          archivo: main.name,
          indice: i,
          error: gridError,
        });
      } else {
        console.warn(
          `[${contexto}] Sin grid para la imagen ${i} ("${main.name}") — se usa el main como placeholder.`,
        );
      }
      grids_.push(mainUrl);
    }

    // El master NUNCA cae al placeholder del main: si no está, tiene que
    // quedar `null`. Poner el main sería mentir sobre qué se puede regenerar, y
    // el día que se reoptimicen las imágenes esa foto se recomprimiría desde
    // una copia ya degradada — el error que este master viene a impedir.
    if (masterPath && !masterError) {
      masters_.push(publicUrl(masterPath));
    } else {
      if (masterError) {
        console.error(`[${contexto} MASTER ERROR]`, {
          archivo: main.name,
          indice: i,
          error: masterError,
        });
      }
      masters_.push(null);
    }
  }

  return { mains, thumbs, grids: grids_, masters: masters_ };
}
