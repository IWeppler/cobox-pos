import { createClient } from "@/shared/config/supabase/server";
import { slugify } from "@/shared/utils/slugify";

type SupabaseServerClient = ReturnType<typeof createClient>;

type CategoriaAtributoRequeridoRow = {
  categoria_id: string;
  atributo_id: string;
  requerido: boolean;
  atributos: { nombre: string } | { nombre: string }[] | null;
};

/**
 * Espejo server-side del chequeo que ya corre en el cliente
 * (useVariantSelection / findMissingRequiredAttributeValues): dado el
 * categoria_id del producto y las opciones que se van a guardar, devuelve
 * los nombres de atributo que categoria_atributos marca como requeridos
 * pero que no tienen ningún valor cargado. `[]` si la categoría no exige
 * nada — nunca bloquea productos en categorías sin config.
 *
 * HEREDA del padre un nivel, igual que
 * `getAtributosRequeridosPorCategoriaAction`, y los dos tienen que decir lo
 * mismo: si el cliente auto-agrega el atributo del padre y el server no lo
 * exige (o al revés), la regla se vuelve un consejo. Desde que el producto
 * puede colgar de una subcategoría, mirar solo la categoría exacta dejaría a
 * las 12 hijas de "Ropa Bebe" sin el Género que su padre declara requerido.
 *
 * Lo declarado en la HIJA gana: una subcategoría puede marcar `requerido:
 * false` sobre un atributo que el padre exige, y eso tiene que valer.
 */
export async function obtenerAtributosRequeridosFaltantes(
  supabase: SupabaseServerClient,
  categoriaId: string | null | undefined,
  opciones: { nombre: string; valores: string[] }[],
): Promise<string[]> {
  if (!categoriaId) return [];

  const { data: categoria } = await supabase
    .from("categorias")
    .select("parent_id")
    .eq("id", categoriaId)
    .maybeSingle();

  const ids = [categoriaId, categoria?.parent_id].filter(
    (id): id is string => Boolean(id),
  );

  const { data: filas, error } = await supabase
    .from("categoria_atributos")
    .select("categoria_id, atributo_id, requerido, atributos(nombre)")
    .in("categoria_id", ids);

  if (error || !filas || filas.length === 0) return [];

  // Un atributo declarado en los dos niveles se resuelve por el más
  // específico, así que la hija se procesa primero.
  const efectivo = new Map<string, CategoriaAtributoRequeridoRow>();
  for (const row of [
    ...(filas as CategoriaAtributoRequeridoRow[]).filter(
      (f) => f.categoria_id === categoriaId,
    ),
    ...(filas as CategoriaAtributoRequeridoRow[]).filter(
      (f) => f.categoria_id !== categoriaId,
    ),
  ]) {
    if (!efectivo.has(row.atributo_id)) efectivo.set(row.atributo_id, row);
  }

  const data = [...efectivo.values()].filter((row) => row.requerido);
  if (data.length === 0) return [];

  const nombresConValor = new Set(
    opciones
      .filter((o) => o.valores.length > 0)
      .map((o) => slugify(o.nombre)),
  );

  return (data as CategoriaAtributoRequeridoRow[])
    .map((row) => {
      const atributo = Array.isArray(row.atributos)
        ? row.atributos[0]
        : row.atributos;
      return atributo?.nombre ?? null;
    })
    .filter((nombre): nombre is string => Boolean(nombre))
    .filter((nombre) => !nombresConValor.has(slugify(nombre)));
}
