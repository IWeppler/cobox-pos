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
