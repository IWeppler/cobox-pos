"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { invalidarCatalogoDeSesion } from "@/shared/lib/cache-catalogo";
import {
  borrarPathsDeStorage,
  recolectarPathsDeImagenes,
} from "@/features/stock/lib/borrar-imagenes-producto";

/**
 * Traduce el freno de la base cuando el producto tiene unidades con IMEI.
 *
 * Desde 20260902150000 la FK de `unidades_serie` es RESTRICT y no CASCADE:
 * borrar un producto ya no puede borrar el registro de garantía de un equipo
 * vendido. Postgres devuelve 23503, y sin traducirlo la pantalla mostraba
 * "Ocurrió un error al eliminar" — que no dice qué pasó ni qué hacer, así que
 * quien lo intenta reintenta para siempre.
 *
 * Se mira el nombre de la constraint y no solo el código: 23503 es cualquier
 * violación de clave foránea, y confundir "tiene IMEIs" con otra causa sería
 * cambiar un mensaje inútil por uno equivocado.
 */
const FK_UNIDADES_SERIE = "unidades_serie_producto_variante_id_fkey";

function mensajeDeBorrado(error: {
  code?: string;
  message?: string;
}): string | null {
  if (error.code !== "23503") return null;
  if (!error.message?.includes(FK_UNIDADES_SERIE)) return null;

  return (
    "No se puede eliminar: tiene unidades con IMEI registradas. " +
    "Se conservan para la garantía y la trazabilidad de los equipos vendidos. " +
    "Si el producto ya no se vende, despublicalo en vez de borrarlo."
  );
}

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
        error:
          mensajeDeBorrado(error) ??
          "No se pudo eliminar el producto de la base de datos.",
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
    // En lote no se sabe CUÁL de los seleccionados tiene los IMEIs, y el
    // borrado es todo-o-nada: ninguno se eliminó. Decirlo es la diferencia
    // entre reintentar a ciegas y sacar el de electro de la selección.
    const porImei = mensajeDeBorrado(error);
    return {
      error: porImei
        ? "No se eliminó ninguno: alguno de los seleccionados tiene unidades con IMEI registradas, que se conservan para la garantía. Sacalo de la selección y volvé a intentar."
        : "Ocurrió un error al eliminar los productos.",
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
