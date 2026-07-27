import { sugerirCategoria } from "./category-suggestions";

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
