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
 * DOS IMÁGENES, y el corte está en el mismo `sm` (640px) que usa el hero para
 * pasar de 16/12 a 90dvh de alto. Una foto encuadrada para el recuadro chato
 * del celular, estirada a una pantalla alta, muestra el centro ampliado y deja
 * la promo afuera. La de desktop es OPCIONAL: sin ella se sirve la de mobile
 * en los dos tamaños, que es lo que pasa hoy en los 4 negocios.
 *
 * Por qué `<picture>` y no dos `<img>` con `hidden`/`sm:block`: un `<img>` con
 * `display:none` se descarga igual, o sea las dos fotos en todos los
 * dispositivos. Con `<picture>` el navegador baja UNA.
 *
 * Y el preload lo escribimos a mano SOLO en ese caso. React preloadea solo
 * todo `<img>` que renderiza un Server Component, pero se saltea los que están
 * adentro de un `<picture>` —no puede saber qué `<source>` va a ganar—, así
 * que sin estas dos líneas el LCP perdería su preload. Llevan el MISMO `media`
 * que los `<source>`: si se desincronizan vuelve la doble descarga que
 * documenta `banner-optimizado.ts`. Con una sola imagen no hay `<picture>` y
 * React sigue emitiendo el suyo, que es lo que ya estaba probado: por eso ese
 * camino queda intacto y no le agregamos un segundo preload que compita.
 */

const MEDIA_DESKTOP = "(min-width: 640px)";
const MEDIA_MOBILE = "(max-width: 639.98px)";

export function BannerCatalogo({
  src,
  srcDesktop,
}: Readonly<{
  src: string;
  srcDesktop?: string | null;
}>) {
  // Un banner que no vive en Storage (URL puesta a mano, apuntando afuera) se
  // sirve tal cual: no hay transformación posible y es mejor que se vea a que
  // no cargue.
  const url = optimizarBanner(src) ?? src;
  const urlDesktop = srcDesktop
    ? (optimizarBanner(srcDesktop, "desktop") ?? srcDesktop)
    : null;

  if (!urlDesktop) {
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

  return (
    <>
      <link
        rel="preload"
        as="image"
        href={url}
        media={MEDIA_MOBILE}
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href={urlDesktop}
        media={MEDIA_DESKTOP}
        fetchPriority="high"
      />
      <picture className="block w-full h-full">
        <source media={MEDIA_DESKTOP} srcSet={urlDesktop} />
        <img
          src={url}
          alt="Banner Promocional"
          fetchPriority="high"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </picture>
    </>
  );
}
