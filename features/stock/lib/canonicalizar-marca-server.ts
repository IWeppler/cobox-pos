import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalizarMarca } from "./marca-por-rubro";

/**
 * Deja la marca en la forma que ya usa el catálogo, leyendo de la base.
 *
 * El combobox sugiere las marcas existentes, pero eso es una ayuda de
 * pantalla: nada impide tipear "Popys" con el catálogo lleno de "popys", ni
 * mandar el campo desde otro lado (una server action es un endpoint). La
 * normalización tiene que correr en el server o el duplicado entra igual —
 * mismo criterio que `normalizarAtributoKeyValor` con los atributos.
 *
 * Solo compara contra las marcas del negocio, que es lo que la RLS devuelve.
 * Ante error de lectura devuelve lo tipeado: no poder consultar el catálogo no
 * es motivo para perder el dato que el usuario cargó.
 */
export async function canonicalizarMarcaContraCatalogo(
  supabase: SupabaseClient,
  marcaTipeada: string | null | undefined,
): Promise<string | null> {
  const limpia = marcaTipeada?.trim();
  if (!limpia) return null;

  // `ilike` sin comodines es igualdad case-insensitive: trae solo las filas de
  // ESA marca en vez del catálogo entero.
  const { data, error } = await supabase
    .from("productos")
    .select("marca")
    .ilike("marca", limpia)
    .limit(50);

  if (error) {
    console.error("[CANONICALIZAR MARCA]", error);
    return limpia;
  }

  const existentes = ((data ?? []) as { marca: string | null }[])
    .map((row) => row.marca?.trim())
    .filter((m): m is string => Boolean(m));

  return canonicalizarMarca(limpia, existentes);
}
