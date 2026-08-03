/**
 * Elección de la imagen que va en og:image.
 *
 * Dos cosas que aprendimos mirando previews reales de WhatsApp:
 *
 * 1. `imagen_url` y `thumbnail_url` NO son strings planos: vienen como
 *    JSON.stringify de un array (`["https://…/a.jpg","https://…/b.jpg"]`).
 *    Pasarlos crudos a openGraph.images rompe la URL (Next no la reconoce
 *    como absoluta y la resuelve contra metadataBase).
 *
 * 2. El generador de previews de WhatsApp no renderiza WebP. La mitad del
 *    catálogo de Evens está en .webp, así que un link podía traer el og:image
 *    "correcto" y aun así verse como un cuadro en blanco. Cuando hay varias
 *    imágenes candidatas (una selección de productos), conviene mandar la
 *    primera en un formato que los scrapers sí dibujan.
 *
 * Nada de esto adivina: si no hay ninguna candidata segura se manda la
 * primera que haya, que es mejor que no mandar imagen.
 */

/** Formatos que los scrapers de WhatsApp/Facebook dibujan sin problema. */
const FORMATOS_SEGUROS = new Set(["jpg", "jpeg", "png"]);

const MIME_POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Extensión en minúsculas, ignorando query string. `null` si no se puede. */
export function extensionDeImagen(url: string | null): string | null {
  if (!url) return null;
  const sinQuery = url.split("?")[0];
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(sinQuery);
  return match ? match[1].toLowerCase() : null;
}

export function esFormatoSeguroParaPreview(url: string | null): boolean {
  const ext = extensionDeImagen(url);
  return ext !== null && FORMATOS_SEGUROS.has(ext);
}

export function tipoMimeDeImagen(url: string | null): string | undefined {
  const ext = extensionDeImagen(url);
  return ext ? MIME_POR_EXTENSION[ext] : undefined;
}

/**
 * TODAS las imágenes de un valor crudo de `imagen_url`, que puede venir como
 * array, como array stringificado o como string plano (posLogo).
 *
 * Interesa la lista completa y no solo la primera: un producto puede tener la
 * foto 1 en webp y la 2 en jpg, y para el preview sirve cualquiera de las
 * suyas antes que caer al logo.
 */
export function listarImagenes(valor: unknown): string[] {
  if (!valor) return [];

  if (Array.isArray(valor)) {
    return valor.filter((url): url is string => typeof url === "string" && url !== "");
  }

  if (typeof valor === "string") {
    if (valor.startsWith("[")) {
      try {
        return listarImagenes(JSON.parse(valor));
      } catch {
        return [valor];
      }
    }
    return [valor];
  }

  return [];
}

export interface CandidataOg {
  /** Valor crudo de imagen_url / posLogo. */
  valor: unknown;
  /** Qué se está mostrando, para el alt. */
  alt?: string;
}

/**
 * Igual que elegirImagenOg pero devolviendo de quién es la imagen elegida.
 *
 * Importa porque la elegida no siempre es la del primer candidato: si el
 * primer producto de la selección tiene solo fotos webp, el preview termina
 * mostrando la del segundo, y el alt tiene que nombrar a ESE producto.
 */
export function elegirImagenOgConEtiqueta(
  candidatas: CandidataOg[],
): { url: string; alt?: string } | null {
  const opciones = candidatas.flatMap((candidata) =>
    listarImagenes(candidata.valor).map((url) => ({
      url,
      alt: candidata.alt,
    })),
  );

  if (opciones.length === 0) return null;
  return (
    opciones.find((opcion) => esFormatoSeguroParaPreview(opcion.url)) ??
    opciones[0]
  );
}

/**
 * De una lista de valores crudos de `imagen_url` (en el orden en que se
 * quieren priorizar), devuelve la mejor URL para el preview: la primera en
 * formato seguro; si no hay ninguna, la primera que exista.
 */
export function elegirImagenOg(candidatas: unknown[]): string | null {
  return (
    elegirImagenOgConEtiqueta(candidatas.map((valor) => ({ valor })))?.url ??
    null
  );
}

/** La forma que espera `openGraph.images`, con el mime cuando se conoce. */
export function imagenOgConMime(
  url: string | null,
  alt?: string,
): { url: string; type?: string; alt?: string }[] | undefined {
  if (!url) return undefined;
  return [{ url, type: tipoMimeDeImagen(url), alt }];
}
