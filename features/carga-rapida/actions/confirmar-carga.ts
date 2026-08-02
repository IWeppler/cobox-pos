"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { crearProductoAction } from "@/features/stock/actions/create-product";
import type {
  ConfirmarCargaResponse,
  LineaCarga,
  LineaCargaExistente,
  ResultadoLineaCarga,
} from "@/features/carga-rapida/types";

type SupabaseDb = ReturnType<typeof createClient>;

function validarLinea(linea: LineaCarga): string | null {
  if (linea.kind === "EXISTENTE") {
    if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
      return "La cantidad tiene que ser mayor a 0.";
    }
    return null;
  }

  if (!linea.nombre.trim()) return "Falta el nombre del producto.";
  if (!Number.isFinite(linea.precioCompra) || linea.precioCompra <= 0) {
    return "El precio de compra tiene que ser mayor a 0.";
  }
  if (!Number.isFinite(linea.precioVenta) || linea.precioVenta <= 0) {
    return "El precio de venta tiene que ser mayor a 0.";
  }
  if (linea.tieneVariantes) {
    if (linea.opciones.length === 0 || linea.variantes.length === 0) {
      return "Las variantes no tienen propiedades o valores válidos.";
    }
  } else if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
    return "La cantidad tiene que ser mayor a 0.";
  }
  return null;
}

// El espejo legacy productos_stock no tiene variante_id — se sincroniza
// por (producto_id, nombre de variante), mismo patrón que actualizarStock
// en features/purchases/actions/merge-purchase.ts. Un fallo acá es drift
// del espejo, no motivo para reportar la línea como fallida: el stock
// canónico (producto_variantes.stock) ya quedó bien vía la RPC atómica.
async function sincronizarStockLegacy(
  supabase: SupabaseDb,
  linea: LineaCargaExistente,
) {
  try {
    const { data: stockExistente, error: stockSelectError } = await supabase
      .from("productos_stock")
      .select("id, cantidad")
      .eq("producto_id", linea.productoId)
      .eq("variante", linea.nombreDisplay)
      .maybeSingle();

    if (stockSelectError) throw stockSelectError;

    if (stockExistente) {
      const { error } = await supabase
        .from("productos_stock")
        .update({
          cantidad: Number(stockExistente.cantidad || 0) + linea.cantidad,
        })
        .eq("id", stockExistente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("productos_stock").insert({
        producto_id: linea.productoId,
        variante: linea.nombreDisplay,
        cantidad: linea.cantidad,
      });
      if (error) throw error;
    }
  } catch (err) {
    console.error(
      `[CARGA RAPIDA] No se pudo sincronizar productos_stock para "${linea.nombreDisplay}":`,
      err,
    );
  }
}

async function procesarLineaExistente(
  supabase: SupabaseDb,
  linea: LineaCargaExistente,
): Promise<ResultadoLineaCarga> {
  const { data: ajustado, error: ajusteError } = await supabase.rpc(
    "ajustar_stock_variante",
    {
      p_variante_id: linea.varianteId,
      p_delta: linea.cantidad,
    },
  );

  if (ajusteError || !ajustado || ajustado.length === 0) {
    return {
      clienteLineaId: linea.clienteLineaId,
      ok: false,
      error: "La variante ya no existe en el catálogo.",
    };
  }

  await sincronizarStockLegacy(supabase, linea);

  return { clienteLineaId: linea.clienteLineaId, ok: true };
}

async function procesarLineaNueva(
  linea: Extract<LineaCarga, { kind: "NUEVA" }>,
): Promise<ResultadoLineaCarga> {
  const formData = new FormData();
  formData.set("nombre", linea.nombre);
  formData.set("sku", linea.codigo ?? "");
  formData.set("marca", linea.marca ?? "");
  formData.set("modelo", linea.modelo ?? "");
  // Referencia al Catálogo Maestro. Los datos ya viajan copiados en los
  // campos de arriba — esto es solo trazabilidad.
  formData.set("id_master", linea.idMaster ?? "");
  formData.set("categoria_id", linea.categoriaId ?? "");
  formData.set("descripcion", "");
  formData.set("precio", String(linea.precioVenta));
  formData.set("precio_costo", String(linea.precioCompra));
  formData.set("tieneVariantes", linea.tieneVariantes ? "true" : "false");
  if (linea.tieneVariantes) {
    formData.set("opciones", JSON.stringify(linea.opciones));
    formData.set("variantes", JSON.stringify(linea.variantes));
  } else {
    formData.set("stockBase", String(linea.cantidad));
  }

  const res = await crearProductoAction(
    { error: null, success: false },
    formData,
  );

  if (!res.success) {
    return {
      clienteLineaId: linea.clienteLineaId,
      ok: false,
      error: res.error || "No se pudo crear el producto.",
    };
  }

  return { clienteLineaId: linea.clienteLineaId, ok: true };
}

// Confirma toda la carga de Carga Rápida. Cada línea es independiente a
// propósito: si una falla (ej. la variante fue borrada en el medio por
// otra pestaña), las demás NO se revierten — diverge del patrón de
// rollback global de create-sale.ts por pedido explícito.
export async function confirmarCargaAction(
  lineas: LineaCarga[],
): Promise<ConfirmarCargaResponse & { error: string | null }> {
  if (!lineas.length) {
    return {
      error: "No hay líneas para confirmar.",
      resultados: [],
      totalOk: 0,
      totalError: 0,
    };
  }

  for (const linea of lineas) {
    const motivo = validarLinea(linea);
    if (motivo) {
      return { error: motivo, resultados: [], totalOk: 0, totalError: 0 };
    }
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const resultados: ResultadoLineaCarga[] = [];

  for (const linea of lineas) {
    try {
      const resultado =
        linea.kind === "EXISTENTE"
          ? await procesarLineaExistente(supabase, linea)
          : await procesarLineaNueva(linea);
      resultados.push(resultado);
    } catch (err) {
      console.error("[CARGA RAPIDA] Error procesando línea:", err);
      resultados.push({
        clienteLineaId: linea.clienteLineaId,
        ok: false,
        error: "Error inesperado al procesar esta línea.",
      });
    }
  }

  revalidatePath("/stock");
  revalidatePath("/store", "layout");

  const totalOk = resultados.filter((r) => r.ok).length;
  const totalError = resultados.length - totalOk;

  return { error: null, resultados, totalOk, totalError };
}
