import imageCompression from "browser-image-compression";

type TipoImagen = "thumbnail" | "main";
export interface ProductoOptimizado {
  main: File;
  thumbnail: File;
}

// 1. Para logos o imágenes individuales
export async function optimizarImagen(
  file: File,
  tipo: TipoImagen = "main"
): Promise<File> {
  const isThumb = tipo === "thumbnail";

  const options = {
    maxSizeMB: isThumb ? 0.03 : 0.1,
    maxWidthOrHeight: isThumb ? 150 : 600,
    useWebWorker: true,
    fileType: "image/webp" as const,
    initialQuality: 0.7,
  };

  try {
    const compressedBlob = await imageCompression(file, options);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const suffix = isThumb ? "-thumb" : "";

    return new File([compressedBlob], `${baseName}${suffix}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error("Error comprimiendo imagen:", error);
    return file;
  }
}

// 2. Para productos (Genera las 2 versiones en paralelo)
export async function optimizarImagenProducto(file: File): Promise<ProductoOptimizado> {
  const [main, thumbnail] = await Promise.all([
    optimizarImagen(file, "main"),
    optimizarImagen(file, "thumbnail"),
  ]);

  return { main, thumbnail };
}