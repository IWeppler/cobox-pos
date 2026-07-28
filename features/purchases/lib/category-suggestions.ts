/**
 * Diccionario curado a mano (keyword de prenda + género -> categoría) para
 * sugerir la categoría de un producto nuevo detectado en un remito, cuando
 * no matcheó ningún producto existente. Sembrado el 2026-07-25 a partir de
 * las categorías reales de Evens Indumentaria — v1, NO exhaustivo. Cuando
 * aparezcan filas "Ambiguo" repetidas con el mismo tipo de prenda, vale la
 * pena sumar esa keyword acá.
 *
 * IMPORTANTE: `categoriaNombre` debe ser copiado LITERAL desde
 * `categorias.nombre` (varios nombres reales tienen espacios dobles o un
 * espacio final, ej. "CAMISAS ", "ZAPATILLAS HOMBRE "). `crearProductoAlVueloAction`
 * resuelve la categoría con `.ilike("nombre", categoriaLimpia)`, que es
 * case-insensitive pero NO tolera espacios de más — un string mal copiado
 * acá no rompe nada visiblemente, simplemente el pre-fill no "prende" o
 * crea una categoría duplicada. Ver test en category-suggestions.test.ts
 * que verifica que cada string exista exacto en la tabla.
 */

export type GeneroDetectado =
  | "hombre"
  | "mujer"
  | "nena"
  | "nino"
  | "bebe"
  | null;

export interface ReglaCategoria {
  /** Keywords de tipo de prenda, ya normalizadas (sin tildes, minúsculas). Basta con que UNA matchee (OR). */
  keywords: string[];
  /**
   * Mapea género detectado -> nombre EXACTO de categoría (copiado de la DB).
   * `default` se usa cuando no se detectó género, o cuando la prenda no
   * discrimina por género en el catálogo actual.
   */
  categoriaPorGenero: Partial<Record<Exclude<GeneroDetectado, null> | "default", string>>;
}

// El orden importa: reglas con keywords más específicas (ej. "camiseta")
// deben ir ANTES que reglas con keywords que son substring de otras (ej.
// "camisa" es substring de "camiseta") — el matching es por `.includes()`.
export const REGLAS_CATEGORIA: ReglaCategoria[] = [
  {
    keywords: ["jean", "pantalon", "palazo"],
    categoriaPorGenero: {
      hombre: "JEANS Y PANTALONES HOMBRE",
      mujer: "JEANS Y PANTALONES MUJER",
      nena: "JEANS Y PANTALONES NENA",
      nino: "JEANS Y PANTALON NIÑOS",
    },
  },
  {
    // "sueter"/"tapado" también aparecen en la categoría legacy
    // "SUETER,TAPADOS,ROPA DE SALIR MUJER" — se prioriza esta (más
    // específica y con más stock real) para evitar que la regla dependa
    // del orden de dos categorías que hoy se superponen en la DB.
    keywords: ["campera", "chaleco", "tapado", "sueter"],
    categoriaPorGenero: {
      hombre: "CAMPERAS Y CHALECOS DE  HOMBRE",
      mujer: "CAMPERAS,CHALECOS,SUERTER Y TAPADOS DE MUJER",
      nena: "CAMPERA NENA",
      nino: "CAMPERAS Y  CHALECO NIÑOS",
    },
  },
  {
    // Debe ir antes que la regla de "camisa" — "camiseta" la contiene como substring.
    keywords: ["buzo", "remera", "camiseta", "blusa", "musculosa"],
    categoriaPorGenero: {
      hombre: "BUZOS,CAMISETAS,SUETER Y REMERAS DE HOMBRE",
      mujer: "BUZOS, CAMISETAS,SUETER, REMERAS Y BLUSAS DE  MUJER",
      nena: "BUZOS Y CAMISETAS DE NENA",
      nino: "BUZOS,CAMISETAS, CAMISAS Y REMERAS NIÑOS",
      default: "Remeras",
    },
  },
  {
    keywords: ["camisa"],
    categoriaPorGenero: { default: "CAMISAS " },
  },
  {
    // Antes de "calza"/"joggin": si el nombre dice explícitamente
    // "conjunto" ese es el tipo de producto real, aunque una de sus
    // piezas sea un jogging/calza (ej. "Conjunto jogging nena").
    keywords: ["conjunto"],
    categoriaPorGenero: { default: "CONJUNTOS" },
  },
  // Vocabulario de bebé/infantil — faltaba por completo (2026-07-28): un
  // remito de Ropa Bebé dejaba casi todas sus filas sin categoría. Cada
  // regla incluye singular Y plural a propósito: las keywords se usan dos
  // veces, para matchear el NOMBRE del producto ("body alondra") y para
  // encontrar la SUBCATEGORÍA real en el árbol ("Bodies" -> slug "bodies").
  {
    keywords: [
      "body",
      "bodies",
      "enterito",
      "enteritos",
      "ranita",
      "ranitas",
      "osito",
      "ositos",
      "pilucho",
      "jardinero",
      "jardineros",
    ],
    categoriaPorGenero: { default: "Bodies" },
  },
  {
    keywords: ["vestido", "vestidos"],
    categoriaPorGenero: { default: "Vestidos" },
  },
  {
    keywords: ["pollera", "polleras"],
    categoriaPorGenero: { default: "Polleras" },
  },
  {
    keywords: ["calza", "joggin"],
    categoriaPorGenero: { default: "JOGGINS Y CALZAS MUJER" },
  },
  {
    // Sin género detectado queda AMBIGUO a propósito: hay 2 categorías
    // distintas (mujer/nena) más una compartida hombre+niños, no hay
    // default razonable.
    keywords: ["bombacha", "corpino", "boxer", "calzoncillo"],
    categoriaPorGenero: {
      mujer: "ROPA INTERIOR MUJER",
      nena: "ROPA INTERIOR NENA",
      hombre: "ROPA INTERIOR HOMBRE Y NIÑOS",
      nino: "ROPA INTERIOR HOMBRE Y NIÑOS",
    },
  },
  {
    keywords: ["zapatilla"],
    categoriaPorGenero: {
      hombre: "ZAPATILLAS HOMBRE ",
      mujer: "ZAPATILLAS MUJER",
      nena: "ZAPATILLAS NIÑAS",
      nino: "ZAPATILLAS NIÑOS",
    },
  },
  { keywords: ["borcego"], categoriaPorGenero: { default: "Borcegos" } },
  { keywords: ["bota"], categoriaPorGenero: { default: "BOTAS" } },
  { keywords: ["media"], categoriaPorGenero: { default: "MEDIAS" } },
  {
    keywords: [
      "gorra",
      "gorro",
      "cinturon",
      "billetera",
      "mochila",
      "bufanda",
      "guante",
      "panuelo",
    ],
    categoriaPorGenero: { default: "ACCESORIOS" },
  },
];

// Palabras de género/edad detectables en el nombre crudo del remito — misma
// idea que GENERO_CANONICO ya hardcodeado en create-purchase-modal.tsx,
// pero como función pura reusable fuera de un componente cliente.
// `beba`/`bebe` van PRIMERO: son los más específicos y no son substring de
// ningún otro (faltaban por completo hasta 2026-07-28 — una fila con
// género "beba" no detectaba nada y caía al `default` de la regla, que en
// un árbol por audiencia termina colgando de la audiencia equivocada).
const GENERO_KEYWORDS: Array<[string, Exclude<GeneroDetectado, null>]> = [
  ["beba", "bebe"],
  ["bebe", "bebe"],
  ["hombre", "hombre"],
  ["varon", "hombre"],
  ["mujer", "mujer"],
  ["nena", "nena"],
  ["nina", "nena"],
  ["nino", "nino"],
  ["nene", "nino"],
];

export function normalizar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Detecta la audiencia a partir de un texto YA normalizado (sin tildes,
 * minúsculas). Exportada para que la resolución por árbol la reuse en vez
 * de reimplementar el vocabulario. */
export function detectarGenero(
  rawNombreNormalizado: string,
): GeneroDetectado {
  for (const [keyword, genero] of GENERO_KEYWORDS) {
    if (rawNombreNormalizado.includes(keyword)) return genero;
  }
  return null;
}

/** Keywords de la familia de prenda que matchea un texto (ej. "blusa
 * vueltio" -> ["buzo","remera","camiseta","blusa","musculosa"]). Sirve
 * para buscar la SUBCATEGORÍA real dentro de un padre, sin depender de
 * los nombres de categoría curados para un comercio puntual. */
export function detectarKeywordsPrenda(texto: string): string[] | null {
  const normalizado = normalizar(texto);
  for (const regla of REGLAS_CATEGORIA) {
    if (regla.keywords.some((kw) => normalizado.includes(kw))) {
      return regla.keywords;
    }
  }
  return null;
}

export interface SugerenciaCategoria {
  categoriaNombre: string;
  matchedKeyword: string;
}

/**
 * Función pura: no toca red ni DB. Recibe el `raw_nombre` de un ítem de
 * remito y devuelve la categoría sugerida según REGLAS_CATEGORIA, o `null`
 * si ninguna keyword matcheó (caso Ambiguo).
 */
export function sugerirCategoria(rawNombre: string): SugerenciaCategoria | null {
  const normalizado = normalizar(rawNombre);
  const genero = detectarGenero(normalizado);

  for (const regla of REGLAS_CATEGORIA) {
    const keywordMatch = regla.keywords.find((kw) => normalizado.includes(kw));
    if (!keywordMatch) continue;

    const categoria =
      (genero && regla.categoriaPorGenero[genero]) ?? regla.categoriaPorGenero.default;

    if (categoria) return { categoriaNombre: categoria, matchedKeyword: keywordMatch };
  }

  return null;
}
