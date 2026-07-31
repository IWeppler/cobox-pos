import type { createClient } from "@/shared/config/supabase/server";
import type { FilaImport } from "./parse-productos-csv";
import type { CatalogoActual } from "./import-productos-plan";

type SupabaseDb = ReturnType<typeof createClient>;

/**
 * Foto del catálogo contra la que se resuelve un import.
 *
 * Vive acá y no en la action a propósito: la usan las DOS actions (preview
 * y confirmar), y exportarla desde un archivo "use server" la convertiría
 * en un server action más, expuesta al cliente como endpoint sin ninguna
 * razón. Como módulo normal, solo corre del lado del server porque solo la
 * llaman actions que ya están ahí.
 */
export async function cargarCatalogoActual(
  supabase: SupabaseDb,
  filas: FilaImport[],
): Promise<CatalogoActual | null> {
  const [productosRes, variantesRes, categoriasRes] = await Promise.all([
    supabase.from("productos").select("id, nombre"),
    supabase
      .from("producto_variantes")
      .select("id, producto_id, sku, atributos, nombre_display"),
    supabase.from("categorias").select("id, nombre, slug"),
  ]);

  if (productosRes.error || variantesRes.error || categoriasRes.error) {
    console.error(
      "[IMPORT PRODUCTOS] Error leyendo el catálogo:",
      productosRes.error ?? variantesRes.error ?? categoriasRes.error,
    );
    return null;
  }

  // Solo se consultan los IMEI que trae el archivo: la tabla crece sin
  // techo y traerla entera para comparar contra 200 filas no escala.
  const imeisDelArchivo = [
    ...new Set(filas.map((f) => f.imei).filter((i): i is string => Boolean(i))),
  ];

  const imeisExistentes = new Set<string>();
  // En lotes, porque un `.in()` con miles de valores arma una URL que el
  // servidor rechaza por longitud.
  for (let i = 0; i < imeisDelArchivo.length; i += 200) {
    const lote = imeisDelArchivo.slice(i, i + 200);
    const { data, error } = await supabase
      .from("unidades_serie")
      .select("imei")
      .in("imei", lote);
    if (error) {
      console.error("[IMPORT PRODUCTOS] Error leyendo unidades_serie:", error);
      return null;
    }
    for (const row of data ?? []) imeisExistentes.add(row.imei as string);
  }

  return {
    productos: (productosRes.data ?? []).map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
    })),
    variantes: (variantesRes.data ?? []).map((v) => ({
      id: v.id as string,
      productoId: v.producto_id as string,
      sku: (v.sku as string | null) ?? null,
      atributos: (v.atributos as Record<string, string> | null) ?? null,
      nombreDisplay: (v.nombre_display as string | null) ?? undefined,
    })),
    categorias: (categoriasRes.data ?? []).map((c) => ({
      id: c.id as string,
      nombre: c.nombre as string,
      slug: c.slug as string,
    })),
    imeisExistentes,
  };
}
