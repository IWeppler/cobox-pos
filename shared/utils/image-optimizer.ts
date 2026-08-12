import imageCompression from "browser-image-compression";
import {
  MAX_BYTES_POR_IMAGEN,
  MAX_IMAGENES_PRODUCTO,
} from "@/shared/utils/limites-imagen";

// Re-export para que el cliente siga importando todo de un solo lugar.
export {
  MAX_BYTES_GUARDADOS,
  MAX_BYTES_POR_IMAGEN,
  MAX_IMAGENES_PRODUCTO,
} from "@/shared/utils/limites-imagen";

type TipoImagen = "thumbnail" | "grid" | "main" | "master";
export interface ProductoOptimizado {
  main: File;
  thumbnail: File;
  grid: File;
  /** Copia de mayor calidad, para regenerar. No se muestra nunca. */
  master: File;
}

/** Error de compresión con el nombre del archivo, para poder avisar cuál falló
 * en vez de mostrar un mensaje genérico. */
export class ImagenNoProcesableError extends Error {
  constructor(
    readonly archivo: string,
    readonly causaOriginal: unknown,
  ) {
    super(
      `No se pudo procesar la imagen "${archivo}". Puede estar dañada o en un formato que este navegador no sabe convertir (por ejemplo HEIC del iPhone). Probá sacarle una captura o guardarla como JPG y subirla de nuevo.`,
    );
    this.name = "ImagenNoProcesableError";
  }
}

// 1. Para logos o imágenes individuales
export async function optimizarImagen(
  file: File,
  tipo: TipoImagen = "main",
): Promise<File> {
  const isThumb = tipo === "thumbnail";
  const isGrid = tipo === "grid";
  const isMaster = tipo === "master";

  // "main" (imagen_url) es la única de las 3 que se ve a tamaño de detalle
  // — en desktop puede ocupar gran parte del viewport, donde 600px con
  // DPR 2x pedía 1200px reales y quedaba corta. No se repite 20 veces por
  // pantalla como thumb/grid, así que el maxSizeMB más alto es aceptable.
  //
  // "grid" (grid_url) subido de 320 a 480: estimación conservadora sin
  // medición exacta de la card del catálogo en desktop — cubre cards de
  // hasta ~240px CSS reales en retina (2x). Ajustar si una medición
  // posterior da un ancho de card distinto.
  // "master" NO es una versión más para mostrar: es la fuente para regenerar
  // las otras tres el día que cambien tamaños o códec. Por eso va con calidad
  // 0.9 y 1600px (por encima de main, que es 1100) y con un techo de peso más
  // alto — apretarlo con los mismos números que una derivada lo convertiría en
  // otra copia degradada, que es justo lo que viene a evitar.
  //
  // Sin master, cualquier decisión de compresión es irreversible: ya pasó una
  // vez que se comprimió de más, la dueña de Evens se quejó y no había desde
  // dónde volver. Ver la migración 20260812140000.
  const baseOptions = {
    maxSizeMB: isMaster ? 1 : isThumb ? 0.03 : isGrid ? 0.1 : 0.2,
    maxWidthOrHeight: isMaster ? 1600 : isThumb ? 150 : isGrid ? 480 : 1100,
    useWebWorker: true,
    initialQuality: isMaster ? 0.9 : 0.7,
  };

  try {
    let compressedBlob = await imageCompression(file, {
      ...baseOptions,
      fileType: "image/webp",
    });

    // Algunos navegadores/WebViews (Safari y varios Android viejos) no
    // saben codificar WebP por canvas: ignoran el mimeType pedido y
    // devuelven PNG en silencio, sin tirar error. Como PNG no tiene
    // pérdida, `quality` no reduce nada ahí — la librería termina
    // compensando el peso encogiendo dimensiones (hasta ~70% del tamaño
    // pedido), la causa real detrás de las fotos borrosas en tablet que
    // midió el diagnóstico. JPEG sí tiene soporte universal de
    // codificación por canvas, así que ahí `quality` vuelve a reducir
    // peso de verdad en vez de resignar dimensión.
    if (compressedBlob.type !== "image/webp") {
      console.warn(
        `[image-optimizer] El navegador no devolvió WebP para "${tipo}" (devolvió "${compressedBlob.type}") — reintentando como JPEG.`,
        { archivo: file.name, tipo },
      );
      compressedBlob = await imageCompression(file, {
        ...baseOptions,
        fileType: "image/jpeg",
      });
    }

    // El nombre/extensión final tiene que reflejar el contenido real — no
    // el que se pidió — para no repetir el mismatch extensión-vs-contenido
    // que hoy tienen los .webp que en realidad son PNG.
    const extension = compressedBlob.type === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const suffix = isThumb
      ? "-thumb"
      : isGrid
        ? "-grid"
        : isMaster
          ? "-master"
          : "";

    return new File([compressedBlob], `${baseName}${suffix}.${extension}`, {
      type: compressedBlob.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    // NO devolver el original. Antes este catch hacía `return file`, y como
    // optimizarImagenProducto llama tres veces, un solo fallo mandaba el
    // archivo crudo TRES veces al server: una foto de 4MB se volvía un body
    // de 12MB que la Server Action rechazaba, sin que nadie se enterara de
    // por qué. Falla ruidoso y que quien llama decida qué mostrar.
    console.error("[image-optimizer] Error comprimiendo imagen:", {
      archivo: file.name,
      tipo,
      tamano: file.size,
      error,
    });
    throw new ImagenNoProcesableError(file.name, error);
  }
}

// 2. Para productos (genera las 3 versiones, UNA POR VEZ)
//
// Antes esto era un Promise.all de las 3, y quien llamaba hacía a su vez un
// Promise.all sobre todos los archivos: 3 × N compresiones simultáneas. Cada
// foto de celular (12MP) se decodifica a un bitmap RGBA de ~48MB, la librería
// mantiene canvas intermedios mientras baja la resolución, y con
// `useWebWorker` levanta un Worker por llamada con su propia copia. Con 4
// fotos eso son 12 decodificaciones y 12 workers vivos al mismo tiempo:
// suficiente para que el navegador de un celular de gama media mate la
// pestaña. El crash no deja excepción ni log de servidor — en la PWA
// instalada aparece como "This page couldn't load".
//
// Serializar cuesta tiempo de reloj, pero el pico de memoria pasa a ser el de
// UNA imagen en vez de 3 × N.
// El master va PRIMERO: si el navegador va a morirse procesando esta foto, que
// se muera antes de haber subido tres derivadas huérfanas de fuente. Las cuatro
// salen del MISMO archivo original, nunca una de otra — encadenarlas sería
// apilar generaciones de pérdida.
export async function optimizarImagenProducto(
  file: File,
): Promise<ProductoOptimizado> {
  const master = await optimizarImagen(file, "master");
  const main = await optimizarImagen(file, "main");
  const thumbnail = await optimizarImagen(file, "thumbnail");
  const grid = await optimizarImagen(file, "grid");

  return { main, thumbnail, grid, master };
}

// 3. Para varios archivos: también uno por vez, por el mismo motivo que
// arriba. Usar SIEMPRE esto en vez de `Promise.all(archivos.map(...))`.
export async function optimizarImagenesProducto(
  files: File[],
): Promise<ProductoOptimizado[]> {
  const resultados: ProductoOptimizado[] = [];
  for (const file of files) {
    resultados.push(await optimizarImagenProducto(file));
  }
  return resultados;
}

export type ArchivosAceptados = {
  aceptados: File[];
  rechazados: { file: File; motivo: string }[];
  /** Cuántos quedaron afuera solo por el tope de cantidad. */
  excedeMaximo: number;
};

/** Filtra una tanda de archivos contra los límites de arriba.
 *
 * `yaSeleccionados` tiene que incluir TANTO las imágenes que el producto ya
 * tiene guardadas COMO las que están elegidas sin guardar todavía: si no, un
 * producto viejo con 5 fotos podría sumar 3 más en cada edición.
 *
 * Devuelve los motivos para poder avisarle al usuario en vez de descartar en
 * silencio. `excedeMaximo` viene aparte porque merece un mensaje propio: no
 * es que el archivo tenga algo malo, es que ya no entra. */
export function filtrarArchivosImagen(
  nuevos: File[],
  yaSeleccionados: number,
): ArchivosAceptados {
  const aceptados: File[] = [];
  const rechazados: { file: File; motivo: string }[] = [];
  let excedeMaximo = 0;

  for (const file of nuevos) {
    if (!file.type.startsWith("image/")) {
      rechazados.push({ file, motivo: "no es una imagen" });
      continue;
    }
    // Chrome/Android no decodifica HEIC/HEIF por canvas, así que la
    // compresión falla y ahora eso corta el guardado entero. Mejor
    // rechazarlo acá con un mensaje que se entienda. Sacar `image/heic` del
    // `accept` del input hace además que iOS entregue JPEG directamente, así
    // que en la práctica esto casi no se dispara.
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      rechazados.push({
        file,
        motivo: "el formato HEIC del iPhone no se puede convertir acá",
      });
      continue;
    }
    if (file.size > MAX_BYTES_POR_IMAGEN) {
      rechazados.push({
        file,
        motivo: `pesa ${(file.size / 1024 / 1024).toFixed(1)}MB (máximo ${MAX_BYTES_POR_IMAGEN / 1024 / 1024}MB)`,
      });
      continue;
    }
    // Va último a propósito: los archivos inválidos no deben consumir cupo.
    if (yaSeleccionados + aceptados.length >= MAX_IMAGENES_PRODUCTO) {
      excedeMaximo++;
      continue;
    }
    aceptados.push(file);
  }

  return { aceptados, rechazados, excedeMaximo };
}
