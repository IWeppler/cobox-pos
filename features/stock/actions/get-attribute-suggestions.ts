"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export interface SugerenciaValorAtributo {
  valor: string;
  productos: number;
}

/**
 * Sugerencias de valores ya en uso para un atributo (Color, Talle, o
 * cualquier propiedad libre), agregadas en vivo desde
 * producto_variantes.atributos (JSONB) — no desde atributo_valores, que
 * puede estar desactualizado respecto a lo que realmente está cargado
 * (ver migración add_sugerencias_valores_atributo_function).
 */
export async function getAtributoValorSuggestionsAction(
  nombreAtributo: string,
): Promise<SugerenciaValorAtributo[]> {
  const nombre = nombreAtributo?.trim();
  if (!nombre) return [];

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("sugerencias_valores_atributo", {
    p_nombre: nombre,
  });

  if (error) {
    console.error("[SUGERENCIAS ATRIBUTO] Error:", error);
    return [];
  }

  return (data ?? []).map((row: { valor: string; productos: number }) => ({
    valor: row.valor,
    productos: Number(row.productos),
  }));
}

export interface AtributoRequeridoCategoria {
  atributoId: string;
  nombre: string;
  requerido: boolean;
}

type CategoriaAtributoRow = {
  atributo_id: string;
  requerido: boolean;
  atributos: { nombre: string } | { nombre: string }[] | null;
};

/**
 * Atributos declarados para una categoría vía categoria_atributos (el form
 * de producto los usa para auto-agregar los requeridos y bloquear el
 * guardado si falta un valor — ver useVariantSelection). Solo devuelve lo
 * que está EXPLÍCITAMENTE declarado para esa categoría — no hay fallback
 * ni herencia implícita.
 */
export async function getAtributosRequeridosPorCategoriaAction(
  categoriaId: string,
): Promise<AtributoRequeridoCategoria[]> {
  if (!categoriaId) return [];

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("categoria_atributos")
    .select("atributo_id, requerido, atributos(nombre)")
    .eq("categoria_id", categoriaId);

  if (error) {
    console.error("[ATRIBUTOS REQUERIDOS CATEGORIA] Error:", error);
    return [];
  }

  return (data as CategoriaAtributoRow[] | null ?? []).flatMap((row) => {
    const atributo = Array.isArray(row.atributos)
      ? row.atributos[0]
      : row.atributos;
    if (!atributo) return [];
    return [
      {
        atributoId: row.atributo_id,
        nombre: atributo.nombre,
        requerido: row.requerido,
      },
    ];
  });
}

/**
 * Nombres de propiedad ya usados en el catálogo (Talle, Color, Género...),
 * leídos de `atributos` — la tabla canónica que normalizarAtributoKeyValor
 * mantiene en cada guardado (creación/edición/conciliación de remitos). No
 * escanea producto_variantes.atributos de nuevo: esa tabla YA es la fuente
 * de verdad deduplicada, con casing consolidado.
 */
export async function getAtributosExistentesAction(): Promise<string[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("atributos")
    .select("nombre")
    .eq("activo", true)
    .order("nombre");

  if (error) {
    console.error("[ATRIBUTOS EXISTENTES] Error:", error);
    return [];
  }

  return (data ?? []).map((row: { nombre: string }) => row.nombre);
}
