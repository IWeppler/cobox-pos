import imageCompression from "browser-image-compression";
import {
  MAX_BYTES_GUARDADOS,
  MAX_BYTES_MASTER,
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

/**
 * Base de los errores de imagen cuyo `message` YA está escrito para que lo lea
 * la persona que subió la foto.
 *
 * Existe para que los consumidores hagan UN solo `instanceof` y muestren el
 * mensaje. Sin base, cada error nuevo hay que agregarlo a mano en las cinco
 * pantallas que suben imágenes, y el que se olvida cae al texto genérico — que
 * es justo el que no dice qué hacer.
 */
export class ImagenError extends Error {}

/** Error de compresión con el nombre del archivo, para poder avisar cuál falló
 * en vez de mostrar un mensaje genérico. */
export class ImagenNoProcesableError extends ImagenError {
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

/**
 * La imagen se pudo procesar, pero no se logró dejarla en un tamaño que el
 * servidor acepte.
 *
 * Es un error DISTINTO de `ImagenNoProcesableError` porque la causa y lo que
 * puede hacer la persona son distintos: acá el archivo no está dañado ni en un
 * formato raro, simplemente este navegador no sabe comprimir bien (típicamente
 * un WebView que ignora el formato pedido y devuelve PNG). Mezclarlos le diría
 * "puede estar dañada" sobre una foto que está perfecta.
 */
export class ImagenNoOptimizableError extends ImagenError {
  constructor(
    readonly archivo: string,
    readonly bytesLogrados: number,
    readonly formatoLogrado: string,
  ) {
    super(
      `No se pudo comprimir "${archivo}" lo suficiente (quedó en ${(bytesLogrados / 1024 / 1024).toFixed(1)}MB). Suele pasar en el navegador del celular: probá subirla desde otro navegador (Chrome), o sacarle una captura de pantalla y subir esa.`,
    );
    this.name = "ImagenNoOptimizableError";
  }
}

/**
 * Formatos que de verdad comprimen una foto.
 *
 * PNG y BMP son SIN PÉRDIDA: `quality` no les hace nada, así que una foto de
 * celular reencodeada a PNG sale igual o MÁS PESADA que el original. Es la
 * causa del incidente del 19/8 — una foto de 2,6MB llegó al server "ya
 * optimizada" y el guard la descartó.
 */
export function esFormatoConPerdida(mime: string): boolean {
  return mime === "image/webp" || mime === "image/jpeg";
}

/**
 * Cuánto puede pesar CADA versión, en dos niveles:
 *
 * - `presupuesto`: lo que consideramos "bien optimizado". Pasarse no es un
 *   error, es la señal para insistir con otra calidad. Va holgado respecto del
 *   objetivo (`maxSizeMB`) para no reencodear de más una foto normal.
 * - `limiteServidor`: lo que la Server Action acepta. Pasarse de acá es
 *   inútil: el archivo se va a descartar igual, así que conviene fallar en el
 *   navegador con un mensaje que se entienda en vez de subirlo para nada.
 */
export function presupuestoDe(tipo: TipoImagen): {
  presupuesto: number;
  limiteServidor: number;
} {
  const MB = 1024 * 1024;
  if (tipo === "master") {
    return { presupuesto: 3 * MB, limiteServidor: MAX_BYTES_MASTER };
  }
  const presupuesto =
    tipo === "thumbnail" ? 0.15 * MB : tipo === "grid" ? 0.4 * MB : 0.8 * MB;
  return { presupuesto, limiteServidor: MAX_BYTES_GUARDADOS };
}

/**
 * Si este navegador sabe codificar WebP por canvas. Se aprende del primer
 * intento y vale para toda la sesión.
 *
 * No es una micro-optimización: `optimizarImagenProducto` genera CUATRO
 * versiones por foto, y cada intento decodifica la imagen entera a un bitmap
 * RGBA (~48MB en una foto de 12MP). En un WebView que no sabe hacer WebP,
 * pedirlo igual en cada versión son cuatro decodificaciones garantizadas al
 * pedo, en el dispositivo que menos memoria tiene — el mismo pico que ya mató
 * pestañas antes (ver el comentario de optimizarImagenProducto).
 *
 * `null` = todavía no sabemos.
 */
let navegadorCodificaWebp: boolean | null = null;

/** Un resultado sirve si comprime de verdad y entra en el presupuesto. */
export function resultadoAceptable(
  mime: string,
  bytes: number,
  tipo: TipoImagen,
): boolean {
  return esFormatoConPerdida(mime) && bytes <= presupuestoDe(tipo).presupuesto;
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

  // Escalera de intentos. Se corta en el PRIMERO cuyo resultado sea aceptable
  // de verdad (formato con pérdida + dentro del presupuesto), no en el primero
  // que no tire excepción.
  //
  // Por qué hace falta una escalera y no un solo reintento: hasta el 19/8 esto
  // pedía WebP y, si el navegador devolvía otra cosa, reintentaba UNA vez como
  // JPEG **sin volver a mirar el resultado**. Los WebViews que ignoran
  // `fileType` lo ignoran las dos veces, así que quedaba un PNG — sin pérdida,
  // más pesado que el original — y se subía como "ya optimizado".
  //
  // El segundo motivo es que `maxSizeMB` de la librería es un OBJETIVO, no un
  // tope: después de `maxIteration` se rinde y devuelve lo mejor que consiguió,
  // que en una foto con mucho detalle puede quedar muy por encima.
  //
  // Los intentos bajan calidad y recién después resignan dimensión, en ese
  // orden: bajar calidad en una foto se nota mucho menos que perder píxeles, y
  // acá el que mira es un cliente decidiendo si compra.
  const { presupuesto, limiteServidor } = presupuestoDe(tipo);
  const intentos: { fileType: string; quality: number; escala: number }[] = [
    // WebP primero: pesa ~30% menos que JPEG a igual calidad. Se saltea si ya
    // sabemos que este navegador no lo sabe codificar.
    ...(navegadorCodificaWebp === false
      ? []
      : [
          {
            fileType: "image/webp",
            quality: baseOptions.initialQuality,
            escala: 1,
          },
        ]),
    // JPEG es el único que TODO canvas sabe codificar.
    { fileType: "image/jpeg", quality: baseOptions.initialQuality, escala: 1 },
    { fileType: "image/jpeg", quality: 0.55, escala: 1 },
    { fileType: "image/jpeg", quality: 0.45, escala: 0.75 },
  ];

  try {
    let compressedBlob: Blob | null = null;

    for (const [indice, intento] of intentos.entries()) {
      const candidato = await imageCompression(file, {
        ...baseOptions,
        fileType: intento.fileType,
        initialQuality: intento.quality,
        maxWidthOrHeight: Math.round(
          baseOptions.maxWidthOrHeight * intento.escala,
        ),
      });

      // Lo que devolvió cuando pedimos WebP es la única forma de saber si este
      // navegador lo sabe codificar: los que no, ignoran `fileType` y
      // responden PNG sin tirar error.
      if (intento.fileType === "image/webp") {
        navegadorCodificaWebp = candidato.type === "image/webp";
      }

      // Se guarda el más liviano visto hasta ahora: si ningún intento entra en
      // el presupuesto, igual queremos subir el mejor y no el último.
      if (!compressedBlob || candidato.size < compressedBlob.size) {
        compressedBlob = candidato;
      }

      if (resultadoAceptable(candidato.type, candidato.size, tipo)) {
        compressedBlob = candidato;
        break;
      }

      console.warn(
        `[image-optimizer] Intento ${indice + 1}/${intentos.length} insuficiente para "${tipo}": ${(candidato.size / 1024 / 1024).toFixed(2)}MB en ${candidato.type} (presupuesto ${(presupuesto / 1024 / 1024).toFixed(2)}MB).`,
        { archivo: file.name, tipo, pedido: intento.fileType },
      );
    }

    if (!compressedBlob) {
      throw new Error("La compresión no devolvió ningún resultado");
    }

    // Última red: si ni el mejor intento entra en lo que el servidor acepta, no
    // tiene sentido subirlo — se descartaría igual y en silencio, que es
    // exactamente lo que pasó el 19/8. Mejor cortar acá con un mensaje.
    if (
      !esFormatoConPerdida(compressedBlob.type) ||
      compressedBlob.size > limiteServidor
    ) {
      throw new ImagenNoOptimizableError(
        file.name,
        compressedBlob.size,
        compressedBlob.type,
      );
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
    // "No entró en el presupuesto" ya es un error con su propio mensaje y su
    // propia causa: si se lo envolviera en ImagenNoProcesableError, la persona
    // leería "puede estar dañada" sobre una foto que está perfecta.
    if (error instanceof ImagenNoOptimizableError) {
      console.error("[image-optimizer] No se pudo optimizar lo suficiente:", {
        archivo: file.name,
        tipo,
        tamanoOriginal: file.size,
        bytesLogrados: error.bytesLogrados,
        formatoLogrado: error.formatoLogrado,
      });
      throw error;
    }

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
