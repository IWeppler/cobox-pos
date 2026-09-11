import { optimizarBanner } from "@/shared/lib/banner-optimizado";
import { objectPositionDeFoco, type Foco } from "@/shared/lib/foco-banner";

/**
 * El banner de la portada del catálogo.
 *
 * Es el elemento LCP en mobile —ocupa casi la pantalla entera— y la única
 * imagen de la app que se sube sin pasar por el pipeline de compresión. Ver
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
 * en los dos tamaños.
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
 * documenta `banner-optimizado.ts`.
 *
 * ─── EL ENCUADRE ───────────────────────────────────────────────────────────
 * `object-cover` recorta desde el CENTRO, y el centro casi nunca es lo que
 * importa. El comercio elige el punto de interés en el modal de encuadre y acá
 * se aplica como `object-position`.
 *
 * Va por variables CSS y no por un `style` con un valor fijo porque con
 * `<picture>` hay UN SOLO `<img>` para las dos fuentes: no existe lugar donde
 * colgarle un `object-position` distinto a cada `<source>`. Con dos variables
 * y un breakpoint, el mismo elemento se encuadra distinto de cada lado. El
 * breakpoint `sm:` de Tailwind es 640px, o sea EXACTAMENTE `MEDIA_DESKTOP`; si
 * uno de los dos se mueve, hay que mover el otro.
 *
 * Los dos focos se aplican aunque haya una sola imagen: el encuadre es del par
 * (imagen, forma), no de la imagen. La misma foto en un recuadro chato y en
 * uno alto necesita mirarse en dos lugares distintos.
 *
 * El valor NUNCA sale de la base ya formateado: `objectPositionDeFoco` arma la
 * cadena desde dos números validados por CHECK, así que no hay texto de un
 * cliente entrando a un `style`.
 */

const MEDIA_DESKTOP = "(min-width: 640px)";
const MEDIA_MOBILE = "(max-width: 639.98px)";

/** Mismo criterio en las dos ramas: el `sm:` de Tailwind es 640px. */
const CLASES_IMG =
  "w-full h-full object-cover [object-position:var(--foco)] sm:[object-position:var(--foco-desktop)]";

export function BannerCatalogo({
  src,
  srcDesktop,
  foco,
  focoDesktop,
}: Readonly<{
  src: string;
  srcDesktop?: string | null;
  foco?: Foco | null;
  focoDesktop?: Foco | null;
}>) {
  // Un banner que no vive en Storage (URL puesta a mano, apuntando afuera) se
  // sirve tal cual: no hay transformación posible y es mejor que se vea a que
  // no cargue.
  const url = optimizarBanner(src) ?? src;
  const urlDesktop = srcDesktop
    ? (optimizarBanner(srcDesktop, "desktop") ?? srcDesktop)
    : null;

  const estiloFoco = {
    "--foco": objectPositionDeFoco(foco),
    "--foco-desktop": objectPositionDeFoco(focoDesktop),
  } as React.CSSProperties;

  if (!urlDesktop) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt="Banner Promocional"
        fetchPriority="high"
        decoding="async"
        className={CLASES_IMG}
        style={estiloFoco}
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
          className={CLASES_IMG}
          style={estiloFoco}
        />
      </picture>
    </>
  );
}
