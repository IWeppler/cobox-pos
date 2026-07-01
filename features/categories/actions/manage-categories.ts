"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { generateSlug } from "../utils/slugify-categories";

type CategoriaBulkInput = {
  id?: string;
  nombre: string;
  parent_id?: string | null;
  activa: boolean;
  isNew?: boolean;
};

export async function bulkSaveCategoriasAction(
  categoriasToUpsert: CategoriaBulkInput[],
  categoriasToDelete: string[],
) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Eliminar las que el usuario borró en la UI
    // (Supabase con ON DELETE CASCADE se encarga de borrar las subcategorías solas)
    if (categoriasToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("categorias")
        .delete()
        .in("id", categoriasToDelete);

      if (deleteError) {
        if (deleteError.code === "23503")
          return {
            error:
              "No se pueden borrar categorías que ya tienen productos asociados.",
          };
        return { error: "Error al eliminar categorías." };
      }
    }

    // 2. Insertar / Actualizar las que quedaron (En 2 pasadas para proteger las relaciones)
    if (categoriasToUpsert.length > 0) {
      // 🚀 SOLUCIÓN MAGISTRAL: En lugar de borrar el ID, le generamos un UUID válido
      // a las nuevas. Así la base de datos recibe un array perfecto y uniforme.
      const payload = categoriasToUpsert.map((cat, index) => ({
        id: cat.isNew || !cat.id ? crypto.randomUUID() : cat.id,
        nombre: cat.nombre,
        slug: generateSlug(cat.nombre),
        parent_id: cat.parent_id || null, // Relación Padre/Hijo
        activa: cat.activa,
        orden: index, // Guardamos el orden visual
      }));

      // Separamos padres de hijos
      const roots = payload.filter((p) => !p.parent_id);
      const children = payload.filter((p) => p.parent_id);

      // PASADA 1: Insertamos/Actualizamos las categorías principales primero
      if (roots.length > 0) {
        const { error: rootError } = await supabase
          .from("categorias")
          .upsert(roots, { onConflict: "id" });

        if (rootError)
          return { error: "Error al guardar las categorías principales." };
      }

      // PASADA 2: Insertamos/Actualizamos las subcategorías
      if (children.length > 0) {
        const { error: childError } = await supabase
          .from("categorias")
          .upsert(children, { onConflict: "id" });

        if (childError) return { error: "Error al guardar las subcategorías." };
      }
    }

    revalidatePath("/configuracion");
    return { success: true, error: null };
  } catch {
    return { success: false, error: "Error interno del servidor." };
  }
}
