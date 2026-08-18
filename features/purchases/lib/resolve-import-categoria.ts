import {
  sugerirCategoria,
  REGLAS_CATEGORIA,
  detectarGenero,
  detectarKeywordsPrenda,
  normalizar,
  type GeneroDetectado,
} from "./category-suggestions";

export type CategoriaReal = {
  id: string;
  nombre: string;
  slug: string;
  parent_id: string | null;
};

export type ResolucionCategoriaImport = {
  categoriaId: string;
  categoriaNombre: string;
  /** true si la categoría resuelta (o alguno de sus ancestros) es "Ropa
   * Bebé" — decide si el género sobrevive como atributo de variante. */
  esRopaBebe: boolean;
};

function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/** Camina la categoría resuelta y sus ancestros (hasta 5 niveles) buscando
 * "bebe" en el slug — mismo criterio de matching por slug que ya usa
 * detectar-estacionalidad.ts para categoría→temporada. */
function esRopaBebeCategoria(
  categoriaId: string,
  categoriasPorId: Map<string, CategoriaReal>,
): boolean {
  let actual = categoriasPorId.get(categoriaId);
  let profundidad = 0;
  while (actual && profundidad < 5) {
    if (actual.slug.includes("bebe")) return true;
    actual = actual.parent_id ? categoriasPorId.get(actual.parent_id) : undefined;
    profundidad++;
  }
  return false;
}

/** Slugs de padre que corresponden a cada audiencia detectada. Se matchea
 * por substring del slug (ya sin tildes) para tolerar "Ropa Niños"/"Niño",
 * "Ropa Bebé"/"Bebés", etc. `nena` NO matchea "ropa-nino" ni viceversa
 * porque "nina"/"nino" difieren en la última letra. */
const SLUGS_POR_AUDIENCIA: Record<Exclude<GeneroDetectado, null>, string[]> = {
  bebe: ["bebe"],
  nena: ["nina", "nena"],
  nino: ["nino", "nene"],
  mujer: ["mujer"],
  hombre: ["hombre"],
};

/** ¿El comercio organiza su catálogo por audiencia? (al menos un padre
 * con hijos cuyo slug sea una audiencia conocida). El comercio que NO lo
 * organiza así da false y conserva el diccionario plano.
 *
 * Ojo: esto cambia solo, sin tocar código. Evens era plano cuando se escribió
 * esta función y hoy tiene el árbol (HOMBRE / MUJER / NENA / NIÑOS / BEBES,
 * con el tipo de prenda como hijo), así que pasó a resolver por audiencia el
 * día que alguien armó las categorías. */
export function tieneArbolDeAudiencia(
  categoriasReales: CategoriaReal[],
): boolean {
  const todosLosSlugs = Object.values(SLUGS_POR_AUDIENCIA).flat();
  return categoriasReales.some(
    (c) =>
      c.parent_id === null &&
      todosLosSlugs.some((slug) => c.slug.includes(slug)) &&
      categoriasReales.some((h) => h.parent_id === c.id),
  );
}

/**
 * Resolución para catálogos con árbol por AUDIENCIA (padre = Ropa
 * Mujer/Hombre/Niña/Niño/Bebé, hijo = tipo de prenda) — el modelo que usa
 * estilo bonito. Separa los dos ejes en vez de mapear a un nombre único:
 *
 *   género  -> PADRE  (audiencia)
 *   keyword -> HIJO   (tipo de prenda, buscado SOLO bajo ese padre)
 *
 * Devuelve `null` si no hay padre para esa audiencia o si el padre no
 * tiene un hijo de esa familia de prenda — deliberadamente NO cae al
 * hijo de otra audiencia. Ese fallback era la causa de que toda fila con
 * género "beba" terminara en "Remeras" de Ropa Niña: el único "Remeras"
 * del árbol.
 */
function resolverPorArbolDeAudiencia(
  rawNombre: string,
  rawGeneroCanonico: string | null,
  categoriasReales: CategoriaReal[],
): { categoriaId: string; categoriaNombre: string } | null {
  if (!rawGeneroCanonico) return null;

  const audiencia = detectarGenero(normalizar(rawGeneroCanonico));
  if (!audiencia) return null;

  const slugsPadre = SLUGS_POR_AUDIENCIA[audiencia];
  const padre = categoriasReales.find(
    (c) =>
      c.parent_id === null &&
      slugsPadre.some((slug) => c.slug.includes(slug)),
  );
  if (!padre) return null;

  const keywordsPrenda = detectarKeywordsPrenda(rawNombre);
  if (!keywordsPrenda) return null;

  const hijo = categoriasReales.find(
    (c) =>
      c.parent_id === padre.id &&
      keywordsPrenda.some((kw) => c.slug.includes(kw)),
  );
  if (!hijo) return null;

  return { categoriaId: hijo.id, categoriaNombre: hijo.nombre };
}

/**
 * Resuelve la categoría destino de una fila del import de remitos contra
 * el árbol REAL de categorías (padre + subcategoría) — nunca inventa una
 * categoría nueva ni cae a un fallback adivinado. Dos niveles de
 * confianza, en orden:
 *
 *   1. La columna Categoría del CSV matchea EXACTO (case-insensitive) el
 *      nombre de una categoría real — máxima confianza.
 *   2. El diccionario de keywords que YA arma las sugerencias en la
 *      pantalla de conciliación (`sugerirCategoria`, `category-suggestions.ts`)
 *      matchea, y esa sugerencia también existe como categoría real.
 *
 * Si ninguno de los dos resuelve, devuelve `null` — la fila queda sin
 * categoría para que la conciliación la pida a mano (nunca se crea una
 * categoría nueva ni se adivina con "primera palabra pluralizada").
 */
export function resolverCategoriaImport(
  rawNombre: string,
  rawCategoria: string | null,
  rawGeneroCanonico: string | null,
  categoriasReales: CategoriaReal[],
): ResolucionCategoriaImport | null {
  const categoriasPorId = new Map(categoriasReales.map((c) => [c.id, c]));

  if (rawCategoria) {
    const exacta = categoriasReales.find(
      (c) => normalizarNombre(c.nombre) === normalizarNombre(rawCategoria),
    );
    if (exacta) {
      return {
        categoriaId: exacta.id,
        categoriaNombre: exacta.nombre,
        esRopaBebe: esRopaBebeCategoria(exacta.id, categoriasPorId),
      };
    }
  }

  // Árbol por audiencia (padre = Ropa Mujer/Niña/Bebé/...): resolver los
  // dos ejes por separado es más confiable que el diccionario plano, que
  // mapea a UN nombre de categoría curado para un comercio puntual.
  const porArbol = resolverPorArbolDeAudiencia(
    rawCategoria || rawNombre,
    rawGeneroCanonico,
    categoriasReales,
  );
  if (porArbol) {
    return {
      ...porArbol,
      esRopaBebe: esRopaBebeCategoria(porArbol.categoriaId, categoriasPorId),
    };
  }

  // Si el comercio TIENE padres de audiencia pero no se pudo resolver
  // arriba, cortamos acá: el diccionario plano de abajo ignora la
  // jerarquía y colgaría la fila de la audiencia equivocada (era la causa
  // de que todo lo de "beba" cayera en Remeras de Ropa Niña).
  if (tieneArbolDeAudiencia(categoriasReales)) return null;

  // Antepone el género (si vino en columna separada) al texto que evalúa
  // sugerirCategoria, para que detecte el género aunque el nombre del
  // producto o la columna Categoría no lo mencionen explícitamente.
  const textoBase = rawCategoria || rawNombre;
  const textoConGenero = rawGeneroCanonico
    ? `${rawGeneroCanonico} ${textoBase}`
    : textoBase;

  const sugerencia = sugerirCategoria(textoConGenero);
  if (!sugerencia) return null;

  const match = categoriasReales.find(
    (c) => normalizarNombre(c.nombre) === normalizarNombre(sugerencia.categoriaNombre),
  );
  if (!match) return null;

  return {
    categoriaId: match.id,
    categoriaNombre: match.nombre,
    esRopaBebe: esRopaBebeCategoria(match.id, categoriasPorId),
  };
}

/** Vocabulario cerrado de género para Ropa Bebé — nunca reusa las
 * etiquetas de Mujer/Hombre/Niña/Niño de las otras categorías. */
export function mapGeneroRopaBebe(
  generoCanonico: string | null,
): "Beba" | "Bebe" | "Unisex" {
  switch (generoCanonico) {
    case "Mujer":
    case "Niña":
      return "Beba";
    case "Hombre":
    case "Niño":
      return "Bebe";
    default:
      return "Unisex";
  }
}

export type AudienciaCategoria = "hombre" | "mujer" | "nena" | "nino" | "bebe";

/**
 * Resuelve la "audiencia" de una categoría real (a qué género/edad está
 * destinada) reusando lo que YA existe — nunca reinventa el mapeo:
 *
 *   1. Bebé: mismo criterio por slug que `esRopaBebeCategoria` (camina
 *      ancestros buscando "bebe").
 *   2. Hombre/Mujer/Niña/Niño: reverse-lookup contra `REGLAS_CATEGORIA` —
 *      si el nombre de la categoría aparece como el valor gendered de
 *      alguna regla (ej. "ZAPATILLAS MUJER" en la regla de zapatillas),
 *      esa es su audiencia.
 *
 * `null` significa "sin audiencia detectable" (ej. ACCESORIOS, MEDIAS,
 * CONJUNTOS no son de un género en particular) — nunca se usa para
 * excluir nada, solo una audiencia CONOCIDA Y DISTINTA excluye.
 */
export function resolverAudienciaCategoria(
  categoriaId: string,
  categoriasReales: CategoriaReal[],
): AudienciaCategoria | null {
  const categoriasPorId = new Map(categoriasReales.map((c) => [c.id, c]));

  if (esRopaBebeCategoria(categoriaId, categoriasPorId)) return "bebe";

  const categoria = categoriasPorId.get(categoriaId);
  if (!categoria) return null;
  const nombreNormalizado = normalizarNombre(categoria.nombre);

  const generosConocidos = ["hombre", "mujer", "nena", "nino"] as const;
  for (const regla of REGLAS_CATEGORIA) {
    for (const genero of generosConocidos) {
      const nombreRegla = regla.categoriaPorGenero[genero];
      if (nombreRegla && normalizarNombre(nombreRegla) === nombreNormalizado) {
        return genero;
      }
    }
  }

  return null;
}
