import { createClient } from "@/shared/config/supabase/server";
import { slugify } from "@/shared/utils/slugify";

type SupabaseServerClient = ReturnType<typeof createClient>;

type CategoriaAtributoRequeridoRow = {
  atributos: { nombre: string } | { nombre: string }[] | null;
};

/**
 * Espejo server-side del chequeo que ya corre en el cliente
 * (useVariantSelection / findMissingRequiredAttributeValues): dado el
 * categoria_id del producto y las opciones que se van a guardar, devuelve
 * los nombres de atributo que categoria_atributos marca como requeridos
 * pero que no tienen ningún valor cargado. `[]` si la categoría no exige
 * nada — nunca bloquea productos en categorías sin config.
 */
export async function obtenerAtributosRequeridosFaltantes(
  supabase: SupabaseServerClient,
  categoriaId: string | null | undefined,
  opciones: { nombre: string; valores: string[] }[],
): Promise<string[]> {
  if (!categoriaId) return [];

  const { data, error } = await supabase
    .from("categoria_atributos")
    .select("atributos(nombre)")
    .eq("categoria_id", categoriaId)
    .eq("requerido", true);

  if (error || !data || data.length === 0) return [];

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
