"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export type AlcancePrecio = "TODOS" | "CATEGORIA";
export type OperacionPrecio =
  | "AUMENTAR_PORCENTAJE"
  | "REDUCIR_PORCENTAJE"
  | "FIJAR_MARGEN";
export type CampoObjetivo = "PRECIO" | "COSTO" | "AMBOS";
export type TipoRedondeo = "SIN_REDONDEO" | "10" | "50" | "100" | "90" | "99";

export interface PrevisualizacionItem {
  producto_id: string;
  nombre: string;
  categoria: string;
  costo_anterior: number;
  costo_nuevo: number;
  diferencia_costo: number;
  precio_anterior: number;
  precio_nuevo: number;
  diferencia_precio: number;
}

// ----------------------------------------------------------------------
// HELPER: Lógica matemática de aplicación y redondeo
// ----------------------------------------------------------------------
function calcularNuevoValor(
  valorOriginal: number,
  operacion: OperacionPrecio,
  valorInput: number,
): number {
  if (operacion === "AUMENTAR_PORCENTAJE")
    return valorOriginal * (1 + valorInput / 100);
  if (operacion === "REDUCIR_PORCENTAJE")
    return valorOriginal * (1 - valorInput / 100);
  return valorOriginal;
}

function aplicarRedondeo(valor: number, tipo: TipoRedondeo): number {
  if (tipo === "SIN_REDONDEO") return Number(valor.toFixed(2));

  const entero = Math.round(valor);

  if (tipo === "10") return Math.ceil(valor / 10) * 10;
  if (tipo === "50") return Math.ceil(valor / 50) * 50;
  if (tipo === "100") return Math.ceil(valor / 100) * 100;

  // Terminar en 90 o 99
  if (tipo === "90") return Math.floor(valor / 100) * 100 + 90;
  if (tipo === "99") return Math.floor(valor / 100) * 100 + 99;

  return entero;
}

// 1. SIMULADOR DE PRECIOS (PREVIEW)
export async function simularPreciosAction(
  alcance: AlcancePrecio,
  categoriaFiltro: string,
  campo: CampoObjetivo,
  operacion: OperacionPrecio,
  valor: number,
  redondeo: TipoRedondeo,
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let query = supabase
    .from("productos")
    .select(
      "id, nombre, tipo, categoria_id, precio, precio_costo, categoria:categorias(nombre)",
    );

  if (alcance === "CATEGORIA" && categoriaFiltro !== "todos") {
    query = query.eq("categoria_id", categoriaFiltro);
  }

  const { data: productos, error } = await query;

  if (error || !productos) {
    return { error: "No se pudieron cargar los productos para la simulación." };
  }

  const preview: PrevisualizacionItem[] = productos.map((prod) => {
    // Blindaje matemático: si viene null/undefined, es 0.
    const costoBase = Number(prod.precio_costo) || 0;
    const precioBase = Number(prod.precio) || 0;

    let nuevoCosto = costoBase;
    let nuevoPrecio = precioBase;

    if (campo === "COSTO" || campo === "AMBOS") {
      nuevoCosto = calcularNuevoValor(costoBase, operacion, valor);
    }

    if (campo === "PRECIO" || campo === "AMBOS") {
      if (operacion === "FIJAR_MARGEN") {
        const costoReferencia = campo === "AMBOS" ? nuevoCosto : costoBase;
        const margenDecimal = valor >= 100 ? 0.99 : valor / 100;
        nuevoPrecio = costoReferencia / (1 - margenDecimal);
      } else {
        nuevoPrecio = calcularNuevoValor(precioBase, operacion, valor);
      }
      nuevoPrecio = aplicarRedondeo(nuevoPrecio, redondeo);
    }

    const categoriaRelacion = Array.isArray(prod.categoria)
      ? prod.categoria[0]
      : prod.categoria;

    return {
      producto_id: prod.id,
      nombre: prod.nombre || "Sin nombre",
      categoria: categoriaRelacion?.nombre || prod.tipo || "Sin categoría",
      costo_anterior: costoBase,
      costo_nuevo: nuevoCosto,
      diferencia_costo: nuevoCosto - costoBase,
      precio_anterior: precioBase,
      precio_nuevo: nuevoPrecio,
      diferencia_precio: nuevoPrecio - precioBase,
    };
  });

  return { preview };
}

// 2. APLICAR CAMBIOS Y GUARDAR LOTE (BATCH)
export async function aplicarPreciosAction(
  nombreLote: string,
  previewData: PrevisualizacionItem[],
  config: {
    alcance: string;
    campo: string;
    operacion: string;
    valor: number;
    redondeo: string;
  },
) {
  if (previewData.length === 0)
    return { error: "No hay productos para actualizar." };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado." };

  try {
    const { data: lote, error: loteError } = await supabase
      .from("actualizaciones_precio")
      .insert({
        nombre:
          nombreLote || `Ajuste ${new Date().toLocaleDateString("es-AR")}`,
        tipo_alcance: config.alcance,
        tipo_operacion: config.operacion,
        campo_objetivo: config.campo,
        valor: config.valor,
        redondeo: config.redondeo,
        cantidad_afectada: previewData.length,
        creado_por: user.id,
      })
      .select("id")
      .single();

    if (loteError || !lote)
      throw new Error("Error creando el registro de actualización.");

    const itemsHistorial = [];

    for (const item of previewData) {
      itemsHistorial.push({
        lote_id: lote.id,
        producto_id: item.producto_id,
        costo_anterior: item.costo_anterior,
        costo_nuevo: item.costo_nuevo,
        precio_anterior: item.precio_anterior,
        precio_nuevo: item.precio_nuevo,
      });

      const { error: updateError } = await supabase
        .from("productos")
        .update({
          precio_costo: item.costo_nuevo,
          precio: item.precio_nuevo,
        })
        .eq("id", item.producto_id);

      if (updateError)
        console.error(
          `Error actualizando producto ${item.producto_id}`,
          updateError,
        );

      const { error: variantesUpdateError } = await supabase
        .from("producto_variantes")
        .update({
          costo: item.costo_nuevo,
          precio: item.precio_nuevo,
        })
        .eq("producto_id", item.producto_id);

      if (variantesUpdateError)
        console.error(
          `Error actualizando variantes del producto ${item.producto_id}`,
          variantesUpdateError,
        );
    }

    await supabase.from("actualizaciones_precio_items").insert(itemsHistorial);

    revalidatePath("/stock");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error en aplicarPreciosAction:", error);
    const message = error instanceof Error ? error.message : null;
    return {
      error:
        message ||
        "Ocurrió un error inesperado al actualizar los precios.",
    };
  }
}

// 3. DESHACER LOTE (ROLLBACK)
export async function revertirPreciosAction(loteId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: items, error: fetchError } = await supabase
    .from("actualizaciones_precio_items")
    .select("producto_id, costo_anterior, precio_anterior")
    .eq("lote_id", loteId);

  if (fetchError || !items)
    return { error: "No se encontraron los datos para revertir." };

  for (const item of items) {
    await supabase
      .from("productos")
      .update({
        precio_costo: item.costo_anterior,
        precio: item.precio_anterior,
      })
      .eq("id", item.producto_id);

    await supabase
      .from("producto_variantes")
      .update({
        costo: item.costo_anterior,
        precio: item.precio_anterior,
      })
      .eq("producto_id", item.producto_id);
  }

  await supabase
    .from("actualizaciones_precio")
    .update({ estado: "REVERTIDO" })
    .eq("id", loteId);

  revalidatePath("/stock");
  return { success: true };
}
