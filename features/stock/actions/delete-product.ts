"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { invalidarCatalogoDeSesion } from "@/shared/lib/cache-catalogo";
import {
  borrarPathsDeStorage,
  recolectarPathsDeImagenes,
} from "@/features/stock/lib/borrar-imagenes-producto";

export async function eliminarProductoAction(id: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // Las URLs se leen ANTES: después del delete ya no hay de dónde sacarlas.
    // El borrado en base cascadea variantes, stock y auditoría, pero Storage no
    // se entera de nada — cada producto borrado dejaba sus 4 archivos ahí para
    // siempre.
    const paths = await recolectarPathsDeImagenes(supabase, [id]);

    const { error } = await supabase.from("productos").delete().eq("id", id);

    if (error) {
      console.error(error);
      return {
        error: "No se pudo eliminar el producto de la base de datos.",
        success: false,
      };
    }

    // Solo después de que la base confirmó: si el delete hubiera fallado,
    // borrar los archivos dejaría un producto vivo con las fotos rotas.
    await borrarPathsDeStorage(supabase, paths);

    revalidatePath("/stock");
    revalidatePath("/ventas");

    return { error: null, success: true };
  } catch (err) {
    console.error("Error in eliminarProductoAction:", err);
    return {
      error: "Ocurrió un error inesperado al intentar eliminar.",
      success: false,
    };
  }
}

export async function bulkDeleteProductsAction(productIds: string[]) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado.", success: false };

  if (!productIds || productIds.length === 0) {
    return { error: "No hay productos seleccionados.", success: false };
  }

  // Mismo criterio que el borrado individual: las URLs se leen antes, los
  // archivos se borran después de que la base confirmó.
  const paths = await recolectarPathsDeImagenes(supabase, productIds);

  // Se eliminan por borrado en cascada (Supabase borrará las variantes y el stock)
  const { error } = await supabase
    .from("productos")
    .delete()
    .in("id", productIds);

  if (error) {
    console.error("Error en bulkDelete:", error);
    return {
      error: "Ocurrió un error al eliminar los productos.",
      success: false,
    };
  }

  await borrarPathsDeStorage(supabase, paths);

  revalidatePath("/stock");
  revalidatePath("/store", "layout");
  await invalidarCatalogoDeSesion(supabase);
  return { error: null, success: true };
}

export async function bulkUpdateCategoryAction(
  productIds: string[],
  nuevaCategoriaId: string,
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

  // 1. Buscamos el nombre de la categoría para el campo 'tipo' legacy
  const { data: cat } = await supabase
    .from("categorias")
    .select("nombre")
    .eq("id", nuevaCategoriaId)
    .single();

  if (!cat)
    return { error: "La categoría seleccionada no existe.", success: false };

  // 2. Actualizamos
  const { error } = await supabase
    .from("productos")
    .update({
      categoria_id: nuevaCategoriaId,
      tipo: cat.nombre, // Fallback por si quedan lugares donde uses el nombre plano
    })
    .in("id", productIds);

  if (error) {
    console.error("Error en bulkCategoryUpdate:", error);
    return {
      error: "Ocurrió un error al actualizar las categorías.",
      success: false,
    };
  }

  revalidatePath("/stock");
  revalidatePath("/store", "layout");
  await invalidarCatalogoDeSesion(supabase);
  return { error: null, success: true };
}
