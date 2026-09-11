/**
 * El banner del catálogo, servido por el transformador de Supabase Storage.
 *
 * Por qué existe un caso especial en vez de prender el optimizador de
 * `next/image` para toda la app: es la ÚNICA imagen que se sube cruda.
 * Medido contra producción:
 *
 *   logo de un comercio ....... 13,6 kB webp
 *   grid de un producto ....... 10,9 kB webp
 *   banner de Evens .......... 1.321 kB JPEG
 *
 * Las fotos de producto y los logos ya pasan por `image-optimizer.ts`, que las
 * comprime en el NAVEGADOR antes de subirlas: llegan a Storage en webp y del
 * tamaño de su lugar en pantalla. El banner no pasa por ahí —ninguna pantalla
 * lo manda al pipeline— y es el elemento LCP del catálogo en mobile.
 *
 * Prender el optimizador global costaría dos cosas que no valen la pena por
 * una imagen: `srcset` de 8 URLs en las otras 27 pantallas que usan
 * `next/image` (~18 kB de markup en una portada de 21 kB), y transformaciones
 * facturadas sobre ~1.800 imágenes de origen que ya están optimizadas.
 *
 * Las transformaciones de Storage se facturan por imagen de origen. Hoy hay UN
 * banner cargado en todo el sistema; como techo, DOS por negocio (mobile y,
 * opcional, desktop).
 */

const RUTA_PUBLICA = "/storage/v1/object/public/";
const RUTA_RENDER = "/storage/v1/render/image/public/";

/**
 * UN ancho por variante, sin `srcset`, y es a propósito.
 *
 * React preloadea solo todo `<img>` que se renderiza en un Server Component, y
 * ese preload automático lleva `href` pelado, sin `imageSrcSet`. Con `srcset`
 * quedaban dos descargas: el preload traía un ancho y el `<img>` elegía otro
 * —en un celular con DPR 2, el preload de 1080px contra el candidato de
 * 1280px— o sea el banner bajado dos veces, justo en el elemento LCP. Un solo
 * ancho hace que el preload apunte exactamente a lo que se va a usar.
 *
 * MOBILE, 1080: el punto medio medido sobre el banner de Evens: 62 kB a 828px,
 * 98 kB a 1080px, 137 kB a 1280px, contra 1.321 kB del original. Alcanza para
 * un celular con DPR alto.
 *
 * DESKTOP, 1920: el hero ocupa 90dvh de alto y el ancho entero de la pantalla,
 * así que 1080 se estira y se ve blando. No hay variante intermedia porque
 * agregarla es volver al `srcset` que causaba la doble descarga.
 *
 * El formato lo negocia Supabase por el header `Accept`, así que webp/avif
 * salen solos sin pedirlo.
 */
const ANCHO: Record<VarianteBanner, number> = {
  mobile: 1080,
  desktop: 1920,
};

export type VarianteBanner = "mobile" | "desktop";

/**
 * La calidad del re-encode. 85, no 75, y hay medición atrás.
 *
 * 75 es el default de `next/image`, pensado para una miniatura de producto.
 * Acá la imagen es un hero a pantalla completa, y desde que ocupa 90dvh el
 * banding se ve. Peor: el archivo que sube el comercio HOY ya suele venir en
 * webp, así que 75 es una SEGUNDA pasada con pérdida sobre una imagen que ya
 * la tuvo. Medido sobre el banner real de Tienda Demo (2276x1280, 72 kB webp),
 * a 1080px: q75 da 22 kB —tira el 70% del archivo original— y q85 da 34 kB.
 * A 1920px, q75 da 49 kB y q85 73 kB. El techo sigue siendo chico para el
 * elemento LCP y la diferencia se ve.
 *
 * OJO con la premisa vieja de este archivo: decía que el banner de Evens pesa
 * 1.321 kB. Hoy pesa 87 kB y mide 736x540 — lo reemplazaron. O sea que el caso
 * que justificaba apretar fuerte ya no existe, y apretar igual solo rompe los
 * banners buenos.
 *
 * `resize=contain` NO agranda: con ese banner de 736px de ancho, pedir 1080 o
 * 1920 devuelve exactamente los mismos bytes. Por eso pedir el ancho grande en
 * desktop no castiga a quien subió una imagen chica — pero tampoco la mejora,
 * y eso se arregla subiendo una más grande, que es lo que dice la ayuda del
 * cargador.
 */
const CALIDAD = 85;

/**
 * Devuelve `null` cuando la URL no es de Storage —un banner puesto a mano,
 * apuntando afuera— para que el llamador sirva el original tal cual en vez de
 * armar una URL de transformación que iba a devolver 400.
 */
export function optimizarBanner(
  src: string | null | undefined,
  variante: VarianteBanner = "mobile",
): string | null {
  if (!src || !src.includes(RUTA_PUBLICA)) return null;

  const base = src.split("?")[0].replace(RUTA_PUBLICA, RUTA_RENDER);
  return `${base}?width=${ANCHO[variante]}&quality=${CALIDAD}&resize=contain`;
}
