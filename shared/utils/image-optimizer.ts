import imageCompression from "browser-image-compression";

type TipoImagen = "thumbnail" | "grid" | "main";
export interface ProductoOptimizado {
  main: File;
  thumbnail: File;
  grid: File;
}

// 1. Para logos o imágenes individuales
export async function optimizarImagen(
  file: File,
  tipo: TipoImagen = "main",
): Promise<File> {
  const isThumb = tipo === "thumbnail";
  const isGrid = tipo === "grid";

  // "main" (imagen_url) es la única de las 3 que se ve a tamaño de detalle
  // — en desktop puede ocupar gran parte del viewport, donde 600px con
  // DPR 2x pedía 1200px reales y quedaba corta. No se repite 20 veces por
  // pantalla como thumb/grid, así que el maxSizeMB más alto es aceptable.
  //
  // "grid" (grid_url) subido de 320 a 480: estimación conservadora sin
  // medición exacta de la card del catálogo en desktop — cubre cards de
  // hasta ~240px CSS reales en retina (2x). Ajustar si una medición
  // posterior da un ancho de card distinto.
  const baseOptions = {
    maxSizeMB: isThumb ? 0.03 : isGrid ? 0.1 : 0.2,
    maxWidthOrHeight: isThumb ? 150 : isGrid ? 480 : 1100,
    useWebWorker: true,
    initialQuality: 0.7,
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
    const suffix = isThumb ? "-thumb" : isGrid ? "-grid" : "";

    return new File([compressedBlob], `${baseName}${suffix}.${extension}`, {
      type: compressedBlob.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error("Error comprimiendo imagen:", error);
    return file;
  }
}

// 2. Para productos (Genera las 3 versiones en paralelo)
export async function optimizarImagenProducto(
  file: File,
): Promise<ProductoOptimizado> {
  const [main, thumbnail, grid] = await Promise.all([
    optimizarImagen(file, "main"),
    optimizarImagen(file, "thumbnail"),
    optimizarImagen(file, "grid"),
  ]);

  return { main, thumbnail, grid };
}
