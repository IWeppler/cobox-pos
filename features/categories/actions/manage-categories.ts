"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  construirPayloadCategorias,
  type CategoriaBulkInput,
} from "../lib/build-categorias-payload";

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
      const payload = construirPayloadCategorias(categoriasToUpsert);

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

        if (childError) {
          console.error("[bulkSaveCategoriasAction] childError:", childError);
          return {
            error: `Error al guardar las subcategorías: ${childError.message}`,
          };
        }
      }
    }

    revalidatePath("/configuracion");
    return { success: true, error: null };
  } catch {
    return { success: false, error: "Error interno del servidor." };
  }
}

export type AtributoCategoriaRow = {
  atributoId: string;
  nombre: string;
  aplica: boolean;
  requerido: boolean;
};

// Trae TODOS los atributos activos del sistema, marcando cuáles ya están
// declarados para esta categoría (y si son requeridos) — el modal
// necesita la lista completa para poder tildar/destildar, no solo lo que
// ya está guardado.
export async function getAtributosCategoriaAction(
  categoriaId: string,
): Promise<{ data: AtributoCategoriaRow[]; error: string | null }> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const [{ data: atributos, error: atributosError }, { data: declarados, error: declaradosError }] =
      await Promise.all([
        supabase
          .from("atributos")
          .select("id, nombre")
          .eq("activo", true)
          .order("orden"),
        supabase
          .from("categoria_atributos")
          .select("atributo_id, requerido")
          .eq("categoria_id", categoriaId),
      ]);

    if (atributosError || declaradosError) {
      return {
        data: [],
        error: "No se pudieron leer los atributos de la categoría.",
      };
    }

    const declaradosPorId = new Map(
      (declarados || []).map((d) => [d.atributo_id, d.requerido]),
    );

    return {
      data: (atributos || []).map((a) => ({
        atributoId: a.id,
        nombre: a.nombre,
        aplica: declaradosPorId.has(a.id),
        requerido: declaradosPorId.get(a.id) ?? false,
      })),
      error: null,
    };
  } catch {
    return { data: [], error: "Error interno del servidor." };
  }
}

// Reemplaza por completo la config de atributos de una categoría — a lo
// sumo unas pocas filas (hoy 3 atributos en el sistema), no hace falta el
// tratamiento transaccional pesado de guardar_variantes_producto: esto es
// configuración de UI/validación, no stock ni plata.
export async function guardarAtributosCategoriaAction(
  categoriaId: string,
  filas: { atributoId: string; requerido: boolean }[],
): Promise<{ success: boolean; error: string | null }> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error: deleteError } = await supabase
      .from("categoria_atributos")
      .delete()
      .eq("categoria_id", categoriaId);

    if (deleteError) {
      return {
        success: false,
        error: "Error al limpiar la config anterior de atributos.",
      };
    }

    if (filas.length > 0) {
      const { error: insertError } = await supabase
        .from("categoria_atributos")
        .insert(
          filas.map((f, index) => ({
            categoria_id: categoriaId,
            atributo_id: f.atributoId,
            requerido: f.requerido,
            orden: index,
          })),
        );

      if (insertError) {
        return {
          success: false,
          error: "Error al guardar los atributos de la categoría.",
        };
      }
    }

    revalidatePath("/configuracion");
    return { success: true, error: null };
  } catch {
    return { success: false, error: "Error interno del servidor." };
  }
}
