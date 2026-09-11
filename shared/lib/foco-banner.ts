/**
 * El punto de interés del banner: dónde NO se puede recortar.
 *
 * El hero es `object-cover`, o sea que la imagen llena el marco y lo que sobra
 * se tira. Por default se tira desde los bordes, dejando el centro — y el
 * centro casi nunca es lo importante. Este módulo traduce el par que guarda la
 * base (dos porcentajes) a lo único que el navegador entiende para eso:
 * `object-position`.
 *
 * Es puro y sin IO a propósito, igual que `recargo-metodo.ts` o
 * `temporada-categoria.ts`: lo comparten el panel (la previsualización del
 * modal de encuadre) y el catálogo público (el render de verdad). Si los dos
 * lados calcularan el encuadre por su cuenta, lo que la dueña ve al encuadrar
 * y lo que ve la clienta serían dos cosas distintas — y este módulo existe
 * justamente para que sean la misma.
 *
 * NULL es un valor con significado y acá es el default de CSS: centrado. No se
 * normaliza a 50 al guardar (ver la migración `20260911200000`), así que
 * tampoco se normaliza al leer.
 */

/** Lo que hace el navegador si nadie encuadró nada. */
export const FOCO_CENTRADO = "50% 50%";

export type Foco = {
  /** 0 = borde izquierdo, 100 = borde derecho. */
  x: number | null | undefined;
  /** 0 = borde superior, 100 = borde inferior. */
  y: number | null | undefined;
};

/**
 * Deja el valor dentro de 0-100 y en entero.
 *
 * Redondea porque la columna es `smallint`: mandar 33,333 lo truncaría en la
 * base y la pantalla mostraría un número distinto del guardado. Un valor que
 * no es un número finito (un NaN de un arrastre a cero píxeles, un null) sale
 * como null, que es "centrado" — nunca como 0, que sería pegarlo al borde.
 */
export function normalizarCoordenadaFoco(
  valor: number | null | undefined,
): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return Math.min(100, Math.max(0, Math.round(valor)));
}

/**
 * El `object-position` de un foco, listo para el style.
 *
 * Si falta cualquiera de las dos coordenadas se centra ESA: un banner al que
 * solo se le movió la vertical tiene que seguir centrado en horizontal, no
 * irse a un borde.
 */
export function objectPositionDeFoco(foco: Foco | null | undefined): string {
  const x = normalizarCoordenadaFoco(foco?.x);
  const y = normalizarCoordenadaFoco(foco?.y);

  if (x === null && y === null) return FOCO_CENTRADO;
  return `${x ?? 50}% ${y ?? 50}%`;
}

/** Si el comercio encuadró esta imagen o está como vino. */
export function tieneFoco(foco: Foco | null | undefined): boolean {
  return (
    normalizarCoordenadaFoco(foco?.x) !== null ||
    normalizarCoordenadaFoco(foco?.y) !== null
  );
}

/**
 * Qué parte de la imagen entra en un marco de otra proporción, en porcentajes
 * del ORIGINAL. Es lo que dibuja el rectángulo del modal: sin verlo, encuadrar
 * es adivinar.
 *
 * `proporcionImagen` y `proporcionMarco` son ancho/alto. Con la imagen más
 * ancha que el marco se recorta a los costados (la altura entra entera) y al
 * revés se recorta arriba y abajo. Es la misma cuenta que hace `object-cover`.
 *
 * Devuelve el rectángulo ya corrido según el foco y CLAVADO adentro de la
 * imagen: un foco al 100% no puede dejar la ventana medio afuera, igual que
 * `object-position` no deja ver más allá del borde.
 */
export function ventanaVisible({
  proporcionImagen,
  proporcionMarco,
  foco,
}: {
  proporcionImagen: number;
  proporcionMarco: number;
  foco?: Foco | null;
}): { x: number; y: number; ancho: number; alto: number } {
  const valida =
    Number.isFinite(proporcionImagen) &&
    Number.isFinite(proporcionMarco) &&
    proporcionImagen > 0 &&
    proporcionMarco > 0;

  // Sin proporciones usables se muestra la imagen entera: un rectángulo
  // inventado sería peor que no dibujar ninguno.
  if (!valida) return { x: 0, y: 0, ancho: 100, alto: 100 };

  const masAncha = proporcionImagen > proporcionMarco;
  const ancho = masAncha ? (proporcionMarco / proporcionImagen) * 100 : 100;
  const alto = masAncha ? 100 : (proporcionImagen / proporcionMarco) * 100;

  const fx = normalizarCoordenadaFoco(foco?.x) ?? 50;
  const fy = normalizarCoordenadaFoco(foco?.y) ?? 50;

  // `object-position` reparte el sobrante según el porcentaje: con 0% la
  // ventana queda pegada al borde inicial y con 100% al final.
  return {
    x: ((100 - ancho) * fx) / 100,
    y: ((100 - alto) * fy) / 100,
    ancho,
    alto,
  };
}

/**
 * La forma del hero en cada tamaño, como ancho/alto.
 *
 * Está acá para que el modal de encuadre dibuje EXACTAMENTE el recorte que va
 * a hacer el catálogo. Es el mismo criterio que `temporada-categoria.ts`
 * contra su función de base: dos lugares que tienen que decir lo mismo, y si
 * dicen cosas distintas la dueña encuadra contra un marco que no existe.
 *
 * OJO: el que manda en pantalla son las clases de Tailwind del hero, en
 * `app/(public)/store/[negocio]/page.tsx` (`aspect-16/20 sm:aspect-[4/1.5]`).
 * Tailwind necesita la clase escrita literal, así que no se puede generar
 * desde estos números — si se cambia una, hay que cambiar la otra.
 */
export const HERO_MOBILE = { ancho: 16, alto: 20 } as const;
export const HERO_DESKTOP = { ancho: 4, alto: 1.5 } as const;

export const proporcionHero = (forma: { ancho: number; alto: number }) =>
  forma.ancho / forma.alto;
