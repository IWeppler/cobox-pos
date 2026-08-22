import { optimizarBanner } from "@/shared/lib/banner-optimizado";

/**
 * El banner de la portada del catálogo.
 *
 * Es el elemento LCP en mobile —ocupa casi la pantalla entera— y la única
 * imagen de la app que se sube sin pasar por el pipeline de compresión: el de
 * Evens pesa 1.321 kB contra los 98 kB que sirve el transformador. Ver
 * `shared/lib/banner-optimizado.ts` para por qué se resuelve acá y no
 * prendiendo el optimizador de `next/image` para toda la app.
 *
 * `<img>` nativo y no `next/image`: con el optimizador global apagado,
 * `next/image` no genera `srcset` ni pasa por ningún loader, así que sería una
 * envoltura sin efecto.
 *
 * Tampoco hay `<link rel="preload">` escrito a mano. React ya preloadea solo
 * las imágenes que se renderizan en un Server Component, y agregarle uno
 * propio dejaba DOS preloads del mismo banner compitiendo. Se probó: es peor
 * que no poner ninguno.
 */
export function BannerCatalogo({
  src,
}: Readonly<{
  src: string;
}>) {
  // Un banner que no vive en Storage (URL puesta a mano, apuntando afuera) se
  // sirve tal cual: no hay transformación posible y es mejor que se vea a que
  // no cargue.
  const url = optimizarBanner(src) ?? src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Banner Promocional"
      fetchPriority="high"
      decoding="async"
      className="w-full h-full object-cover"
    />
  );
}
