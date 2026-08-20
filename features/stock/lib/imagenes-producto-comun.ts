import {
  MAX_BYTES_GUARDADOS,
  MAX_BYTES_MASTER,
} from "@/shared/utils/limites-imagen";

/**
 * Lo que comparten las DOS rutas de subida de imágenes de producto: la nueva,
 * que sube desde el navegador directo a Storage, y la vieja, que sube desde la
 * Server Action.
 *
 * Vive acá y no duplicado en cada una porque la convención de paths es un
 * contrato con datos ya guardados: 1.374 imágenes en producción están en
 * `{negocio}/{uuid}.ext`, `{negocio}/thumbs/...`, `{negocio}/grids/...` y
 * `{negocio}/masters/...`. Si las dos rutas se separaran y una cambiara el
 * patrón, las fotos nuevas quedarían en otro lado y el día que haya que
 * regenerar derivadas no se encontrarían.
 *
 * Sin dependencias de cliente ni de servidor a propósito: lo importan los dos
 * lados.
 */

export type UrlsImagenesProducto = {
  mains: string[];
  thumbs: string[];
  grids: string[];
  /** Alineado por índice con los otros tres. `null` = el master no subió; la
   * foto se muestra igual, pero esa no se va a poder regenerar. */
  masters: (string | null)[];
};

/** Cache de un año: los nombres llevan UUID, nunca cambian bajo la misma URL. */
export const CACHE_CONTROL_IMAGEN = "31536000";

function extension(nombre: string): string {
  return nombre.split(".").pop() ?? "jpg";
}

/**
 * Una derivada (thumb/grid) que pesa como un original ES un original: se trata
 * como si no hubiera venido y se cae al main como placeholder.
 */
export function esDerivadaUsable(f: File | undefined | null): f is File {
  return Boolean(f) && f!.size > 0 && f!.size <= MAX_BYTES_GUARDADOS;
}

/**
 * El master tiene su propio techo, más alto: medirlo con la vara de una
 * derivada lo descartaría por ser justamente lo que tiene que ser, la copia
 * más pesada.
 */
export function esMasterUsable(f: File | undefined | null): f is File {
  return Boolean(f) && f!.size > 0 && f!.size <= MAX_BYTES_MASTER;
}

/** Nada sin comprimir debe llegar a Storage — el guard que atrapó la foto de
 * 2,6MB del incidente del 19/8. */
export function esMainUsable(f: File | undefined | null): f is File {
  return Boolean(f) && f!.size > 0 && f!.size <= MAX_BYTES_GUARDADOS;
}

/**
 * Valida una URL de imagen que MANDÓ EL CLIENTE.
 *
 * Con la subida directa a Storage, lo que llega a la Server Action ya no son
 * bytes sino URLs — y una URL que manda el navegador es una URL que se elige
 * con las DevTools abiertas. Mismo criterio que con los precios en
 * create-sale: el server no confía, verifica.
 *
 * Sin esto, un request modificado podría dejar guardada en el catálogo la URL
 * de cualquier imagen de internet, o —peor— la de OTRO negocio, que es
 * exactamente el aislamiento que la policy de Storage protege del lado de la
 * escritura.
 *
 * Se exige: mismo host de Supabase, el prefijo público del bucket `productos`
 * y que la primera carpeta sea el negocio activo.
 */
export function esUrlImagenPropia(
  url: unknown,
  negocioId: string,
  supabaseUrl: string | undefined,
): url is string {
  if (typeof url !== "string" || url === "" || !supabaseUrl) return false;

  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.host !== base.host) return false;

  const prefijo = "/storage/v1/object/public/productos/";
  if (!parsed.pathname.startsWith(prefijo)) return false;

  // `..` en el path podría escaparse de la carpeta del negocio.
  if (parsed.pathname.includes("..")) return false;

  const resto = parsed.pathname.slice(prefijo.length);
  return resto.startsWith(`${negocioId}/`);
}

export type PathsImagen = {
  base: string;
  main: string;
  thumb: string | null;
  grid: string | null;
  master: string | null;
};

/**
 * Los cuatro paths de UNA imagen, con un UUID común que los hermana.
 *
 * `thumb`/`grid`/`master` vuelven `null` cuando el archivo no es usable, para
 * que quien sube no tenga que repetir la decisión.
 */
export function construirPathsImagen(
  negocioId: string,
  archivos: {
    main: File;
    thumb?: File | null;
    grid?: File | null;
    master?: File | null;
  },
  uuid: string,
): PathsImagen {
  return {
    base: uuid,
    main: `${negocioId}/${uuid}.${extension(archivos.main.name)}`,
    thumb: esDerivadaUsable(archivos.thumb)
      ? `${negocioId}/thumbs/${uuid}-thumb.${extension(archivos.thumb.name)}`
      : null,
    grid: esDerivadaUsable(archivos.grid)
      ? `${negocioId}/grids/${uuid}-grid.${extension(archivos.grid.name)}`
      : null,
    master: esMasterUsable(archivos.master)
      ? `${negocioId}/masters/${uuid}-master.${extension(archivos.master.name)}`
      : null,
  };
}
