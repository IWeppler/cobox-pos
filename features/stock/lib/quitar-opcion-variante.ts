import type { Opcion } from "../types";

/**
 * Saca una propiedad de la grilla de variantes.
 *
 * Vive acá y no inline en el hook porque el predicado tiene dos condiciones
 * cruzadas y la versión anterior las combinaba al revés:
 *
 *     prev.filter((o) => o.id !== id || !o.bloqueado)
 *
 * `filter` conserva lo que da true, así que sobre la propiedad que se quería
 * borrar eso decía "conservala si NO está bloqueada" — o sea exactamente lo
 * contrario. Una propiedad normal nunca se podía eliminar (el tacho no hacía
 * nada, verificado en /stock el 2/9/2026) y una bloqueada —las que exige la
 * categoría y que la UI ni siquiera deja borrar— era la única que se iba.
 *
 * `bloqueado` gana siempre: mientras la categoría exija esa propiedad, se
 * queda aunque llegue el pedido de borrarla por otro camino que el botón.
 */
export function quitarOpcionVariante(opciones: Opcion[], id: string): Opcion[] {
  return opciones.filter((opcion) => opcion.id !== id || opcion.bloqueado);
}
