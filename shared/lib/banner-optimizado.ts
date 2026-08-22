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
 * banner cargado en todo el sistema; como techo, uno por negocio.
 */

const RUTA_PUBLICA = "/storage/v1/object/public/";
const RUTA_RENDER = "/storage/v1/render/image/public/";

/**
 * UN ancho, sin `srcset`, y es a propósito.
 *
 * React preloadea solo todo `<img>` que se renderiza en un Server Component, y
 * ese preload automático lleva `href` pelado, sin `imageSrcSet`. Con `srcset`
 * quedaban dos descargas: el preload traía un ancho y el `<img>` elegía otro
 * —en un celular con DPR 2, el preload de 1080px contra el candidato de
 * 1280px— o sea el banner bajado dos veces, justo en el elemento LCP. Un solo
 * ancho hace que el preload apunte exactamente a lo que se va a usar.
 *
 * 1080 es el punto medio medido sobre el banner de Evens: 62 kB a 828px,
 * 98 kB a 1080px, 137 kB a 1280px, contra 1.321 kB del original. Alcanza para
 * un celular con DPR alto y se escala bien en desktop, donde además el banner
 * va detrás de un velo oscuro con texto encima.
 *
 * El formato lo negocia Supabase por el header `Accept`, así que webp/avif
 * salen solos sin pedirlo.
 */
const ANCHO = 1080;

/** 75 es el default de `next/image`; sobre una foto de vidriera no se nota. */
const CALIDAD = 75;

/**
 * Devuelve `null` cuando la URL no es de Storage —un banner puesto a mano,
 * apuntando afuera— para que el llamador sirva el original tal cual en vez de
 * armar una URL de transformación que iba a devolver 400.
 */
export function optimizarBanner(src: string | null | undefined): string | null {
  if (!src || !src.includes(RUTA_PUBLICA)) return null;

  const base = src.split("?")[0].replace(RUTA_PUBLICA, RUTA_RENDER);
  return `${base}?width=${ANCHO}&quality=${CALIDAD}&resize=contain`;
}
