import type { Opcion } from "../types";

/**
 * Devuelve los nombres de propiedad (normalizados: trim + lowercase) que
 * se repiten entre 2 o más opciones. `buildVariantKey` usa `opcion.nombre`
 * como clave de un Record, así que dos propiedades con el mismo nombre
 * colisionan en silencio y una puede pisar el estado de la otra.
 */
export function findDuplicatePropertyNames(opciones: Opcion[]): Set<string> {
  const countByNormalized = new Map<string, number>();

  for (const opcion of opciones) {
    const normalizado = opcion.nombre.trim().toLowerCase();
    if (!normalizado) continue;
    countByNormalized.set(normalizado, (countByNormalized.get(normalizado) ?? 0) + 1);
  }

  const duplicados = new Set<string>();
  for (const [normalizado, count] of countByNormalized) {
    if (count > 1) duplicados.add(normalizado);
  }

  return duplicados;
}
