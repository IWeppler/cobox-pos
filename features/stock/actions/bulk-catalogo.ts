"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/**
 * Publica u oculta del catálogo público un lote de productos.
 *
 * Espejo masivo de togglePublicadoAction (toggle-shared.ts): misma columna,
 * mismo efecto, un solo UPDATE por lote en vez de N round-trips.
 */
export async function bulkTogglePublicadoAction(
  productIds: string[],
  publicado: boolean,
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado.", success: false };

  if (!productIds || productIds.length === 0) {
    return { error: "No hay productos seleccionados.", success: false };
  }

  const { error } = await supabase
    .from("productos")
    .update({ publicado })
    .in("id", productIds);

  if (error) {
    console.error("Error en bulkTogglePublicado:", error);
    return {
      error: "No se pudo cambiar la visibilidad de los productos.",
      success: false,
    };
  }

  revalidatePath("/stock");
  revalidatePath("/store", "layout");
  return { error: null, success: true };
}
