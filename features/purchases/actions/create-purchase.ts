"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export type RawOrderItem = {
  raw_nombre: string;
  raw_variante: string;
  cantidad: number;
  precio_costo: number;
  raw_categoria?: string;
  raw_sku?: string | null;
};

export async function procesarPedidoAction(
  proveedor: string,
  items: RawOrderItem[],
) {
  console.log(">>> [SERVER ACTION] 1. Iniciando procesarPedidoAction...");
  console.log(
    `>>> [SERVER ACTION] 2. Proveedor: ${proveedor}, Items a procesar: ${items?.length}`,
  );

  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    console.log(">>> [SERVER ACTION] 3. Verificando sesión...");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error(
        ">>> [SERVER ACTION] ERROR: Usuario no autenticado",
        authError,
      );
      return {
        success: false,
        error: "No autorizado. Inicia sesión nuevamente.",
      };
    }

    if (!proveedor || !items || items.length === 0) {
      console.warn(">>> [SERVER ACTION] WARN: Faltan datos.");
      return { success: false, error: "Faltan datos para procesar el pedido." };
    }

    console.log(">>> [SERVER ACTION] 4. Calculando presupuesto total...");
    const total_presupuestado = items.reduce(
      (acc, item) =>
        acc + Number(item.cantidad || 0) * Number(item.precio_costo || 0),
      0,
    );
    console.log(
      ">>> [SERVER ACTION] Total presupuestado:",
      total_presupuestado,
    );

    console.log(
      ">>> [SERVER ACTION] 5. Insertando cabecera de orden_compra...",
    );
    const { data: orden, error: errorOrden } = await supabase
      .from("ordenes_compra")
      .insert({
        proveedor,
        fecha_remito: new Date().toISOString(),
        total_presupuestado: isNaN(total_presupuestado)
          ? 0
          : total_presupuestado,
        estado: "PENDIENTE",
      })
      .select("id")
      .single();

    if (errorOrden || !orden) {
      console.error(
        ">>> [SERVER ACTION] ERROR BD ORDEN:",
        JSON.stringify(errorOrden, null, 2),
      );
      return {
        success: false,
        error:
          "Error guardando cabecera: " + (errorOrden?.message || "Desconocido"),
      };
    }

    console.log(
      `>>> [SERVER ACTION] 6. Cabecera creada (ID: ${orden.id}). Buscando historial de productos...`,
    );

    const [
      { data: productos, error: prodError },
      { data: diccionario, error: dicError },
    ] = await Promise.all([
      supabase.from("productos").select("id, nombre, precio_costo"),
      supabase
        .from("diccionario_alias")
        .select("raw_nombre, producto_id")
        .eq("proveedor", proveedor),
    ]);

    if (prodError) {
      console.error(
        ">>> [SERVER ACTION] WARN: Error al buscar productos:",
        prodError,
      );
      await supabase.from("ordenes_compra").delete().eq("id", orden.id);
      return {
        success: false,
        error: "Error buscando productos existentes: " + prodError.message,
      };
    }

    if (dicError) {
      console.error(
        ">>> [SERVER ACTION] WARN: Error al buscar diccionario:",
        dicError,
      );
      await supabase.from("ordenes_compra").delete().eq("id", orden.id);
      return {
        success: false,
        error: "Error buscando alias del proveedor: " + dicError.message,
      };
    }

    console.log(
      `>>> [SERVER ACTION] 7. Mapeando ${items.length} items para insertar...`,
    );
    const itemsProcesados = items.map((item) => {
      let estado_match = "DESCONOCIDO";
      let producto_id = null;

      const nombreLimpioExcel = item.raw_nombre?.trim().toLowerCase() || "";
      const aliasMatch = diccionario?.find(
        (a) => a.raw_nombre?.trim().toLowerCase() === nombreLimpioExcel,
      );

      if (aliasMatch) {
        producto_id = aliasMatch.producto_id;
      } else {
        const exactMatch = productos?.find(
          (p) => p.nombre?.trim().toLowerCase() === nombreLimpioExcel,
        );
        if (exactMatch) producto_id = exactMatch.id;
      }

      if (producto_id) {
        const productoReal = productos?.find((p) => p.id === producto_id);
        if (productoReal) {
          if (
            item.precio_costo > 0 &&
            item.precio_costo > Number(productoReal.precio_costo || 0)
          ) {
            estado_match = "MODIFICADO";
          } else {
            estado_match = "PERFECTO";
          }
        }
      }

      return {
        orden_id: orden.id,
        raw_nombre: item.raw_nombre?.trim() || "Desconocido",
        raw_variante: item.raw_variante?.trim() || "Unico",
        raw_categoria: item.raw_categoria?.trim() || null,
        raw_sku: item.raw_sku?.trim() || null,
        cantidad: isNaN(Number(item.cantidad)) ? 0 : Number(item.cantidad),
        precio_costo: isNaN(Number(item.precio_costo))
          ? 0
          : Number(item.precio_costo),
        estado_match,
        producto_id,
        variante_match: producto_id ? item.raw_variante?.trim() : null,
      };
    });

    console.log(
      ">>> [SERVER ACTION] 8. Insertando items en lotes (chunks) a la base de datos...",
    );

    // Inserción en lotes para evitar saturar el payload de Supabase si el Excel es enorme
    const CHUNK_SIZE = 500;
    let insertError = null;

    for (let i = 0; i < itemsProcesados.length; i += CHUNK_SIZE) {
      const chunk = itemsProcesados.slice(i, i + CHUNK_SIZE);
      console.log(
        `>>> [SERVER ACTION] Insertando lote ${i} a ${i + chunk.length}...`,
      );

      const { error: errorItems } = await supabase
        .from("ordenes_items")
        .insert(chunk);

      if (errorItems) {
        insertError = errorItems;
        console.error(
          `>>> [SERVER ACTION] ERROR BD ITEMS (Lote ${i}):`,
          JSON.stringify(errorItems, null, 2),
        );
        break;
      }
    }

    if (insertError) {
      console.log(
        ">>> [SERVER ACTION] 9. Haciendo Rollback de la cabecera por error en los items...",
      );
      await supabase.from("ordenes_compra").delete().eq("id", orden.id);
      return {
        success: false,
        error: "Error guardando filas del Excel: " + insertError.message,
      };
    }

    console.log(
      ">>> [SERVER ACTION] 10. Todo guardado correctamente. Revalidando caché...",
    );
    revalidatePath("/stock");

    return { success: true, error: null, ordenId: orden.id };
  } catch (error) {
    console.error(">>> [SERVER ACTION] ERROR FATAL CATCH:", error);
    return {
      success: false,
      error:
        "Ocurrió un error inesperado en el servidor: " +
        (error as Error)?.message,
    };
  }
}
