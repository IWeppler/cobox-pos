/**
 * Temporada de venta de una categoría.
 *
 * Es el dato que el dueño sabe y el sistema no puede deducir: el POS tiene 5
 * semanas de historia, así que no hay forma de aprender la estacionalidad de
 * los datos. Un campo cargado a mano una vez vale más que un año de historia
 * y se puede tener hoy.
 *
 * REGLA DE USO, y es lo importante: **sirve solo para SILENCIAR, nunca para
 * sugerir.** "No me muestres abrigos en la reposición de noviembre" es seguro
 * — el peor caso es que falte una fila. "Comprá mallas que viene el verano" es
 * una predicción que el sistema no puede respaldar y que cuesta plata real si
 * se equivoca. La misma asimetría de siempre: una recomendación equivocada
 * cuesta más que diez ausentes.
 *
 * Espejo de `public.categoria_en_temporada` en la base. Los dos tienen que
 * decir lo mismo — mismo patrón que `tipo-egreso.ts` y `recargo-metodo.ts`.
 */

export const TEMPORADAS = [
  "TODO_EL_ANIO",
  "VERANO",
  "INVIERNO",
  "MEDIA_ESTACION",
] as const;

export type Temporada = (typeof TEMPORADAS)[number];

export const ETIQUETA_TEMPORADA: Record<Temporada, string> = {
  TODO_EL_ANIO: "Todo el año",
  VERANO: "Verano",
  INVIERNO: "Invierno",
  MEDIA_ESTACION: "Media estación",
};

/**
 * Meses en los que la temporada SE VENDE (1 = enero). Hemisferio sur, y son
 * ventanas comerciales, no meteorológicas: la ropa de verano se vende desde
 * octubre, no desde el 21 de diciembre.
 *
 * Se solapan a propósito. En marzo conviven la liquidación de verano y la
 * entrada de media estación, y una ventana que no lo refleje termina
 * silenciando mercadería que sí se está vendiendo.
 */
const MESES_DE_VENTA: Record<Exclude<Temporada, "TODO_EL_ANIO">, number[]> = {
  VERANO: [10, 11, 12, 1, 2, 3],
  INVIERNO: [4, 5, 6, 7, 8, 9],
  MEDIA_ESTACION: [3, 4, 5, 9, 10, 11],
};

/**
 * Normaliza lo que venga de la base o de un form.
 *
 * Cae a TODO_EL_ANIO ante cualquier cosa rara, que es el valor que NO
 * silencia: si el dato está mal, mostrar es el lado seguro.
 */
export function normalizarTemporada(valor: unknown): Temporada {
  return TEMPORADAS.includes(valor as Temporada)
    ? (valor as Temporada)
    : "TODO_EL_ANIO";
}

/**
 * Si esa temporada está vendiéndose en esa fecha.
 *
 * `fecha` por defecto es hoy. Ojo con pasar un `Date` construido desde un ISO
 * sin hora: `new Date("2026-09-15")` se interpreta en UTC y en Argentina
 * puede caer un día antes, lo que en un cambio de mes mueve la ventana.
 */
export function estaEnTemporada(
  temporada: unknown,
  fecha: Date = new Date(),
): boolean {
  const normalizada = normalizarTemporada(temporada);
  if (normalizada === "TODO_EL_ANIO") return true;
  return MESES_DE_VENTA[normalizada].includes(fecha.getMonth() + 1);
}

/**
 * Filtro para las señales de Insights: qué categorías NO hay que sugerir hoy.
 *
 * Devuelve los ids fuera de temporada, para restar. Es a propósito la forma
 * negativa: obliga a que el consumidor la use para sacar, no para agregar.
 */
export function categoriasFueraDeTemporada(
  categorias: { id: string; temporada?: string | null }[],
  fecha: Date = new Date(),
): string[] {
  return categorias
    .filter((c) => !estaEnTemporada(c.temporada, fecha))
    .map((c) => c.id);
}
