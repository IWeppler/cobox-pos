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

export interface AdvertenciasPrecio {
  productosPrecioCero: number;
  variantesPrecioCero: number;
  reduccionTotal: boolean;
  productosResultanCeroONegativo: number;
}

export interface AjustePrecioHistorialItem {
  id: string;
  nombre: string;
  tipo_alcance: AlcancePrecio;
  tipo_operacion: OperacionPrecio;
  campo_objetivo: CampoObjetivo;
  valor: number;
  estado: string;
  creado_en: string;
  revertido_en: string | null;
  productosAfectados: number;
  variantesAfectadas: number;
  tieneAuditoriaVariantes: boolean;
}

export interface RevertirPreviewItem {
  producto_id: string;
  variante_id: string | null;
  nombre: string;
  precio_actual: number;
  precio_al_revertir: number;
  costo_actual: number;
  costo_al_revertir: number;
  cambia: boolean;
}

async function esUsuarioAdmin(
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // is_admin() resuelve el rol dentro del negocio activo. perfiles.rol quedó
  // deprecada: es NULL para todo usuario invitado, así que leerla acá dejaba a
  // una encargada nueva sin poder actualizar precios.
  const { data: esAdmin } = await supabase.rpc("is_admin");

  return esAdmin === true;
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

  // Chequeo de precio $0 en variantes del alcance (el operador de % directo
  // no tiene ningún efecto sobre una base en $0, y no había ninguna alerta
  // de esto antes de aplicar el ajuste).
  const productoIds = productos.map((p) => p.id);
  const { data: variantesEnAlcance } = await supabase
    .from("producto_variantes")
    .select("id, producto_id, precio")
    .in("producto_id", productoIds.length > 0 ? productoIds : [""]);

  const esAjustePorcentualSobrePrecio =
    (operacion === "AUMENTAR_PORCENTAJE" ||
      operacion === "REDUCIR_PORCENTAJE") &&
    (campo === "PRECIO" || campo === "AMBOS");

  const productosPrecioCero = esAjustePorcentualSobrePrecio
    ? productos.filter((p) => (Number(p.precio) || 0) === 0).length
    : 0;

  const variantesPrecioCero = esAjustePorcentualSobrePrecio
    ? (variantesEnAlcance || []).filter((v) => (Number(v.precio) || 0) === 0)
        .length
    : 0;

  const reduccionTotal = operacion === "REDUCIR_PORCENTAJE" && valor >= 100;

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
        // El tipo se llama FIJAR_MARGEN por compatibilidad con el
        // historial ya guardado en actualizaciones_precio(_items), pero la
        // fórmula es de recargo sobre costo (mismo criterio que
        // handleAplicarRecargoGlobal en merge-table.tsx), no margen sobre
        // precio de venta.
        const costoReferencia = campo === "AMBOS" ? nuevoCosto : costoBase;
        nuevoPrecio = costoReferencia * (1 + valor / 100);
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

  const productosResultanCeroONegativo =
    campo === "PRECIO" || campo === "AMBOS"
      ? preview.filter((item) => item.precio_nuevo <= 0).length
      : 0;

  const advertencias: AdvertenciasPrecio = {
    productosPrecioCero,
    variantesPrecioCero,
    reduccionTotal,
    productosResultanCeroONegativo,
  };

  return { preview, advertencias };
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

    const itemsHistorial: {
      lote_id: string;
      producto_id: string;
      variante_id: string | null;
      costo_anterior: number;
      costo_nuevo: number;
      precio_anterior: number;
      precio_nuevo: number;
    }[] = [];

    for (const item of previewData) {
      itemsHistorial.push({
        lote_id: lote.id,
        producto_id: item.producto_id,
        variante_id: null,
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

      // Leemos el valor previo REAL de cada variante antes de sobreescribirlo,
      // para poder auditarlo y revertirlo puntualmente si hace falta.
      const { data: variantesPrevias } = await supabase
        .from("producto_variantes")
        .select("id, precio, costo")
        .eq("producto_id", item.producto_id);

      for (const variante of variantesPrevias || []) {
        itemsHistorial.push({
          lote_id: lote.id,
          producto_id: item.producto_id,
          variante_id: variante.id,
          costo_anterior: Number(variante.costo) || 0,
          costo_nuevo: item.costo_nuevo,
          precio_anterior: Number(variante.precio) || 0,
          precio_nuevo: item.precio_nuevo,
        });
      }

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

// 3. LISTAR HISTORIAL DE AJUSTES
export async function listarHistorialPreciosAction(): Promise<
  { data: AjustePrecioHistorialItem[]; error?: undefined } | { error: string }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!(await esUsuarioAdmin(supabase))) {
    return { error: "Solo un administrador puede ver el historial de ajustes de precio." };
  }

  const { data: lotes, error: lotesError } = await supabase
    .from("actualizaciones_precio")
    .select(
      "id, nombre, tipo_alcance, tipo_operacion, campo_objetivo, valor, estado, creado_en, revertido_en, cantidad_afectada",
    )
    .order("creado_en", { ascending: false });

  if (lotesError || !lotes) {
    return { error: "No se pudo cargar el historial de ajustes." };
  }

  if (lotes.length === 0) return { data: [] };

  const loteIds = lotes.map((l) => l.id);
  const { data: filasVariante } = await supabase
    .from("actualizaciones_precio_items")
    .select("lote_id")
    .in("lote_id", loteIds)
    .not("variante_id", "is", null);

  const variantesPorLote = new Map<string, number>();
  (filasVariante || []).forEach((f) => {
    variantesPorLote.set(f.lote_id, (variantesPorLote.get(f.lote_id) || 0) + 1);
  });

  const data: AjustePrecioHistorialItem[] = lotes.map((lote) => {
    const variantesAfectadas = variantesPorLote.get(lote.id) || 0;
    return {
      id: lote.id,
      nombre: lote.nombre,
      tipo_alcance: lote.tipo_alcance as AlcancePrecio,
      tipo_operacion: lote.tipo_operacion as OperacionPrecio,
      campo_objetivo: lote.campo_objetivo as CampoObjetivo,
      valor: Number(lote.valor),
      estado: lote.estado,
      creado_en: lote.creado_en,
      revertido_en: lote.revertido_en,
      productosAfectados: lote.cantidad_afectada ?? 0,
      variantesAfectadas,
      tieneAuditoriaVariantes: variantesAfectadas > 0,
    };
  });

  return { data };
}

// 4. PREVISUALIZAR REVERSIÓN DE UN LOTE
export async function previsualizarRevertirPreciosAction(
  loteId: string,
): Promise<
  { preview: RevertirPreviewItem[]; error?: undefined } | { error: string }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!(await esUsuarioAdmin(supabase))) {
    return { error: "Solo un administrador puede revertir un ajuste de precios." };
  }

  const { data: items, error: fetchError } = await supabase
    .from("actualizaciones_precio_items")
    .select("producto_id, variante_id, costo_anterior, precio_anterior")
    .eq("lote_id", loteId);

  if (fetchError || !items || items.length === 0)
    return { error: "No se encontraron los datos de este ajuste para previsualizar." };

  const productoIds = [...new Set(items.map((i) => i.producto_id))];
  const varianteIds = items
    .filter((i) => i.variante_id)
    .map((i) => i.variante_id as string);

  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, precio, precio_costo")
    .in("id", productoIds);

  const { data: variantes } =
    varianteIds.length > 0
      ? await supabase
          .from("producto_variantes")
          .select("id, nombre_display, precio, costo")
          .in("id", varianteIds)
      : { data: [] };

  const productosMap = new Map((productos || []).map((p) => [p.id, p]));
  const variantesMap = new Map((variantes || []).map((v) => [v.id, v]));

  const preview: RevertirPreviewItem[] = items.map((item) => {
    const producto = productosMap.get(item.producto_id);
    const precioAlRevertir = Number(item.precio_anterior) || 0;
    const costoAlRevertir = Number(item.costo_anterior) || 0;

    if (item.variante_id) {
      const variante = variantesMap.get(item.variante_id);
      const precioActual = Number(variante?.precio) || 0;
      const costoActual = Number(variante?.costo) || 0;
      return {
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        nombre: `${producto?.nombre ?? "Producto eliminado"} — ${variante?.nombre_display ?? "variante eliminada"}`,
        precio_actual: precioActual,
        precio_al_revertir: precioAlRevertir,
        costo_actual: costoActual,
        costo_al_revertir: costoAlRevertir,
        cambia: precioActual !== precioAlRevertir || costoActual !== costoAlRevertir,
      };
    }

    const precioActual = Number(producto?.precio) || 0;
    const costoActual = Number(producto?.precio_costo) || 0;
    return {
      producto_id: item.producto_id,
      variante_id: null,
      nombre: producto?.nombre ?? "Producto eliminado",
      precio_actual: precioActual,
      precio_al_revertir: precioAlRevertir,
      costo_actual: costoActual,
      costo_al_revertir: costoAlRevertir,
      cambia: precioActual !== precioAlRevertir || costoActual !== costoAlRevertir,
    };
  });

  return { preview };
}

// 5. DESHACER LOTE (ROLLBACK)
export async function revertirPreciosAction(loteId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!(await esUsuarioAdmin(supabase))) {
    return { error: "Solo un administrador puede revertir un ajuste de precios." };
  }

  const { data: lote } = await supabase
    .from("actualizaciones_precio")
    .select("estado")
    .eq("id", loteId)
    .single();

  if (lote?.estado === "REVERTIDO") {
    return { error: "Este ajuste ya fue revertido anteriormente." };
  }

  const { data: items, error: fetchError } = await supabase
    .from("actualizaciones_precio_items")
    .select("producto_id, variante_id, costo_anterior, precio_anterior")
    .eq("lote_id", loteId);

  if (fetchError || !items)
    return { error: "No se encontraron los datos para revertir." };

  // Lotes creados antes de que se registrara variante_id no tienen ninguna
  // fila a nivel variante: para esos, mantenemos el comportamiento anterior
  // (revertir todas las variantes del producto al valor del producto), ya
  // que no hay valor por-variante que restaurar.
  const productosConFilaDeVariante = new Set(
    items.filter((i) => i.variante_id).map((i) => i.producto_id),
  );

  for (const item of items) {
    if (item.variante_id) {
      // Fila a nivel variante: revertir solo esa variante puntual.
      await supabase
        .from("producto_variantes")
        .update({
          costo: item.costo_anterior,
          precio: item.precio_anterior,
        })
        .eq("id", item.variante_id);
    } else {
      // Fila a nivel producto.
      await supabase
        .from("productos")
        .update({
          precio_costo: item.costo_anterior,
          precio: item.precio_anterior,
        })
        .eq("id", item.producto_id);

      // Fallback para lotes históricos sin filas de variante: revertir en
      // bloque, igual que antes de esta migración.
      if (!productosConFilaDeVariante.has(item.producto_id)) {
        await supabase
          .from("producto_variantes")
          .update({
            costo: item.costo_anterior,
            precio: item.precio_anterior,
          })
          .eq("producto_id", item.producto_id);
      }
    }
  }

  await supabase
    .from("actualizaciones_precio")
    .update({ estado: "REVERTIDO", revertido_en: new Date().toISOString() })
    .eq("id", loteId);

  revalidatePath("/stock");
  return { success: true };
}
