import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/shared/utils/slugify";
import { capitalizar } from "@/entities/productos/lib/parse-variant-attributes";

export interface AtributoCanonico {
  nombre: string;
  valor: string;
  atributoId: string;
  valorId: string;
}

/**
 * Busca si ya existe una forma canónica para este nombre de propiedad y
 * valor (case/tilde-insensitive vía slug, mismo criterio que ya usaba
 * edit-product.ts) y devuelve ESA forma en vez de la tipeada esta vez —
 * así "COLOR" y "Color" siempre terminan siendo la misma fila en
 * `atributos` y el mismo string en el JSONB de `producto_variantes`. Si no
 * existe ninguna, crea la fila con un formato default (capitalizado).
 *
 * Devuelve null si nombre o valor quedan vacíos después de trim.
 */
export async function normalizarAtributoKeyValor(
  supabase: SupabaseClient,
  nombreRaw: string,
  valorRaw: string,
): Promise<AtributoCanonico | null> {
  const nombreInput = nombreRaw?.trim();
  const valorInput = valorRaw?.trim();
  if (!nombreInput || !valorInput) return null;

  const slugAttr = slugify(nombreInput);

  const { data: attrExistente, error: attrSelectError } = await supabase
    .from("atributos")
    .select("id, nombre")
    .eq("slug", slugAttr)
    .maybeSingle();
  if (attrSelectError) throw attrSelectError;

  let atributoId: string;
  let nombreCanonico: string;

  if (attrExistente) {
    atributoId = attrExistente.id;
    nombreCanonico = attrExistente.nombre;
  } else {
    nombreCanonico = capitalizar(nombreInput);
    const { data: nuevoAttr, error: attrInsertError } = await supabase
      .from("atributos")
      .insert({
        nombre: nombreCanonico,
        slug: slugAttr,
        tipo: "TEXT",
        activo: true,
      })
      .select("id")
      .single();
    if (attrInsertError) throw attrInsertError;
    atributoId = nuevoAttr.id;
  }

  const slugVal = slugify(valorInput);

  const { data: valExistente, error: valSelectError } = await supabase
    .from("atributo_valores")
    .select("id, valor")
    .eq("atributo_id", atributoId)
    .eq("slug", slugVal)
    .maybeSingle();
  if (valSelectError) throw valSelectError;

  let valorId: string;
  let valorCanonico: string;

  if (valExistente) {
    valorId = valExistente.id;
    valorCanonico = valExistente.valor;
  } else {
    valorCanonico = capitalizar(valorInput);
    const { data: nuevoVal, error: valInsertError } = await supabase
      .from("atributo_valores")
      .insert({
        atributo_id: atributoId,
        valor: valorCanonico,
        slug: slugVal,
        activo: true,
      })
      .select("id")
      .single();
    if (valInsertError) throw valInsertError;
    valorId = nuevoVal.id;
  }

  return { nombre: nombreCanonico, valor: valorCanonico, atributoId, valorId };
}

export type AtributoCache = Record<
  string,
  {
    nombreCanonico: string;
    atributoId: string;
    valores: Record<string, { valorCanonico: string; valorId: string }>;
  }
>;

/**
 * Normaliza todas las (propiedad, valor) de un set de `opciones` una sola
 * vez y arma un cache para reusar mientras se procesan las variantes —
 * evita repetir el lookup en la base por cada combinación que comparte la
 * misma propiedad/valor.
 */
export async function construirCacheAtributos(
  supabase: SupabaseClient,
  opciones: { nombre: string; valores: string[] }[],
): Promise<AtributoCache> {
  const cache: AtributoCache = {};

  for (const op of opciones) {
    for (const valorOriginal of op.valores) {
      const canonico = await normalizarAtributoKeyValor(
        supabase,
        op.nombre,
        valorOriginal,
      );
      if (!canonico) continue;

      if (!cache[op.nombre]) {
        cache[op.nombre] = {
          nombreCanonico: canonico.nombre,
          atributoId: canonico.atributoId,
          valores: {},
        };
      }
      cache[op.nombre].valores[valorOriginal] = {
        valorCanonico: canonico.valor,
        valorId: canonico.valorId,
      };
    }
  }

  return cache;
}

/** Traduce los valores tipeados por el usuario a su forma canónica ya cacheada. */
export function canonicalizarValores(
  valoresOriginales: Record<string, string>,
  cache: AtributoCache,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [nombreOriginal, valorOriginal] of Object.entries(
    valoresOriginales,
  )) {
    const entry = cache[nombreOriginal];
    const valorEntry = entry?.valores[valorOriginal];
    if (!entry || !valorEntry) continue;
    result[entry.nombreCanonico] = valorEntry.valorCanonico;
  }
  return result;
}
