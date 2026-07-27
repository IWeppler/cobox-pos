/**
 * Seed de industria "Indumentaria" — T5.1 de la épica de categorías.
 *
 * Estado real al 2026-07-26: es la plantilla del MODELO (padre=audiencia,
 * subcategoría=tipo de prenda), no un árbol completo y cerrado. Evens
 * sigue con sus 28 categorías planas (parent_id null) — no se tocó nada
 * ahí. Estilo bonito es la primera validación real, y solo tiene 10 de
 * sus 40 categorías re-parentadas (Pasada 1); las otras 30 siguen sin
 * padre a propósito, pendientes de que la dueña confirme audiencia.
 *
 * Lección de la Pasada 1: NO asumir que el nombre de una categoría trae
 * la audiencia. Evens nombra compuesto ("JEANS Y PANTALONES MUJER");
 * estilo bonito nombra corto sin ningún indicador de audiencia
 * ("Camperas", "Buzos", "Remeras" — nada dice Mujer/Hombre/Niños/Bebé).
 * Por eso este seed separa:
 *   (a) el MODELO (siempre aplica)
 *   (b) heurísticas de nombre que son seguras en CUALQUIER comercio de
 *       indumentaria (vocabulario de ropa interior adulta, que no se
 *       comparte con la versión infantil de la prenda)
 *   (c) todo lo demás, que SIEMPRE requiere confirmación manual con la
 *       dueña — no hay atajo de nombre que lo resuelva de forma genérica.
 */

export type Audiencia = "Mujer" | "Hombre" | "Niños" | "Bebé";

export const PADRES_AUDIENCIA: Record<Audiencia, string> = {
  Mujer: "Ropa Mujer",
  Hombre: "Ropa Hombre",
  Niños: "Ropa Niños",
  Bebé: "Ropa Bebé",
};

/**
 * Reglas de nombre → audiencia que son seguras de aplicar SIN preguntarle
 * a la dueña, en cualquier comercio de indumentaria: son términos de ropa
 * interior/prendas específicamente adultas, donde la versión infantil de
 * la misma prenda se vende bajo otra palabra (ej. "corpiñito", no
 * "Corpiños"). Validado en Evens (Boxer→Hombre, ya decidido en la épica
 * original) y en estilo bonito (Pasada 1, T2.2, confirmado con 54
 * productos reasignados sin tocar ningún producto).
 */
export const REGLAS_AUDIENCIA_SEGURAS: { keywords: string[]; audiencia: Audiencia }[] = [
  { keywords: ["boxer", "slip"], audiencia: "Hombre" },
  {
    keywords: [
      "corpino", // sin tilde — normalizar con el mismo slugify que category-suggestions.ts
      "bombacha",
      "tanga",
      "colaless",
      "culoteless",
      "vedettina",
    ],
    audiencia: "Mujer",
  },
];

/**
 * Todo lo demás — prendas sin género inherente (Buzos, Camperas,
 * Remeras...) o de audiencia mixta por naturaleza (Vestidos, Body,
 * Enteritos: mismo nombre para adultas y bebés) — NO tiene heurística.
 * Un futuro onboarding debe mostrarle esta lista a la dueña como
 * "pendientes de decisión", igual que se hizo acá, nunca adivinar.
 *
 * Ejemplos reales de categorías que cayeron en este bucket en estilo
 * bonito (Pasada 1, 30 de 40 categorías): Buzos, Camperas, Calzas,
 * Conjuntos, Remeras, Pantalon, Vestidos, Body, Enteritos, Saquitos,
 * Jardineros — más las que no son ropa en absoluto (Accesorios,
 * Juguetes, Mantas, Gorros).
 */

/**
 * TODO (fuera de esta pasada, T1.5 de la épica): vocabulario cerrado de
 * Género (Mujer/Hombre/Nena/Nene/Beba/Bebe/Unisex) + mapa de sinónimos
 * canonicalizados, compartido entre este seed, el form de variantes y el
 * parser de CSV/remito. No existe todavía — no inventar acá.
 */
