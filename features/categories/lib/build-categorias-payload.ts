import { generateSlug } from "../utils/slugify-categories";

export type CategoriaBulkInput = {
  id?: string;
  nombre: string;
  parent_id?: string | null;
  activa: boolean;
  isNew?: boolean;
};

/**
 * Arma el payload de upsert a partir de lo que mandó el cliente.
 *
 * Antes esto regeneraba el id con `crypto.randomUUID()` para TODA fila
 * `isNew`, sin importar si el cliente ya le había asignado uno real — eso
 * rompía el link padre/hijo cuando ambos se crean en la misma pasada: el
 * hijo manda `parent_id` apuntando al id que el padre tenía en el momento
 * de indentarlo, pero el padre terminaba persistido con OTRO id distinto
 * (el regenerado acá), así que el hijo quedaba huérfano o colgado de lo
 * que sea que ese id viejo resolviera visualmente después.
 *
 * Ahora: si el cliente ya mandó un id no vacío (nuevo o existente), se
 * preserva tal cual — es justamente lo que permite que un padre + sus
 * subcategorías creados en el mismo guardado terminen apuntándose bien.
 * Solo se genera un id nuevo cuando de verdad no vino ninguno (fallback
 * defensivo, no debería pasar si el cliente ya asigna id a toda fila
 * nueva desde que se creó, pero no cuesta nada cubrir el caso).
 *
 * Vive en un módulo aparte (no en manage-categories.ts) porque ese
 * archivo tiene "use server" — Next exige que TODO export de un archivo
 * "use server" sea una Server Action async, y esto es una función pura
 * sincrónica que además necesitamos poder importar directo en tests.
 */
export function construirPayloadCategorias(categorias: CategoriaBulkInput[]) {
  return categorias.map((cat, index) => ({
    id: cat.id && cat.id.trim() !== "" ? cat.id : crypto.randomUUID(),
    nombre: cat.nombre,
    slug: generateSlug(cat.nombre),
    parent_id: cat.parent_id || null, // Relación Padre/Hijo
    activa: cat.activa,
    orden: index, // Guardamos el orden visual
  }));
}
