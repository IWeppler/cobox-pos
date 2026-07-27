import type { Opcion } from "../types";
import { slugify } from "@/shared/utils/slugify";

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

const GENERIC_NAME_PATTERN = /^(propiedad|opci[oó]n)\s*\d*$/i;

/**
 * Devuelve los nombres de propiedad (normalizados) que matchean el patrón
 * genérico "Propiedad N" / "Opción N" — el fallback que usa el parser de
 * variantes legacy (parse-variant-attributes.ts) cuando no puede saber el
 * nombre real de una propiedad. El form de edición precarga esos nombres
 * en `opciones`; si el vendedor guarda sin renombrarlos, no deberían
 * persistirse como si fueran nombres reales.
 */
export function findGenericPropertyNames(opciones: Opcion[]): Set<string> {
  const genericos = new Set<string>();

  for (const opcion of opciones) {
    const normalizado = opcion.nombre.trim().toLowerCase();
    if (!normalizado) continue;
    if (GENERIC_NAME_PATTERN.test(normalizado)) {
      genericos.add(normalizado);
    }
  }

  return genericos;
}

/**
 * Devuelve los nombres (slugificados) de `atributosRequeridosNombres` que
 * todavía NO tienen ningún valor cargado en `opciones` — ya sea porque la
 * propiedad ni está en la grilla, o está pero con `valores: []`.
 * `buildCartesianVariants` excluye del cruce cualquier opción con 0
 * valores, así que el chequeo correcto no es "hay variantes sin este
 * atributo" (nunca se generan) sino "la opción requerida tiene algún
 * valor cargado". Normaliza con `slugify` (no `.toLowerCase()`, como las
 * otras dos funciones de este archivo) para matchear exactamente cómo
 * useVariantSelection arma `atributosRequeridosNombres`.
 */
export function findMissingRequiredAttributeValues(
  opciones: Opcion[],
  atributosRequeridosNombres: Set<string>,
): Set<string> {
  if (atributosRequeridosNombres.size === 0) return new Set();

  const tieneValoresPorNombre = new Map<string, boolean>();
  for (const opcion of opciones) {
    const key = slugify(opcion.nombre);
    if (!key) continue;
    const tieneValores = opcion.valores.length > 0;
    tieneValoresPorNombre.set(
      key,
      (tieneValoresPorNombre.get(key) ?? false) || tieneValores,
    );
  }

  const faltantes = new Set<string>();
  for (const requerido of atributosRequeridosNombres) {
    if (!tieneValoresPorNombre.get(requerido)) faltantes.add(requerido);
  }

  return faltantes;
}
