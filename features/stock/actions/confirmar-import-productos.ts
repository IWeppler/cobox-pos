"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import { slugify } from "@/shared/utils/slugify";
import {
  canonicalizarValores,
  construirCacheAtributos,
  type AtributoCache,
} from "@/features/stock/lib/normalize-atributo";
import type { FilaImport } from "@/features/stock/lib/parse-productos-csv";
import {
  claveAtributos,
  claveProducto,
  construirPlanImport,
  MAX_FILAS_IMPORT,
  type ItemPlan,
} from "@/features/stock/lib/import-productos-plan";
import { cargarCatalogoActual } from "@/features/stock/lib/cargar-catalogo-import";

export interface ResultadoFilaImport {
  fila: number;
  producto: string;
  ok: boolean;
  detalle: string;
}

export interface ConfirmarImportResponse {
  error: string | null;
  resultados: ResultadoFilaImport[];
  totalOk: number;
  totalError: number;
}

type SupabaseDb = ReturnType<typeof createClient>;

export async function confirmarImportProductosAction(
  filas: FilaImport[],
): Promise<ConfirmarImportResponse> {
  if (!filas.length) {
    return {
      error: "El archivo no tiene filas para importar.",
      resultados: [],
      totalOk: 0,
      totalError: 0,
    };
  }
  if (filas.length > MAX_FILAS_IMPORT) {
    return {
      error: `El archivo tiene ${filas.length} filas y el máximo es ${MAX_FILAS_IMPORT}.`,
      resultados: [],
      totalOk: 0,
      totalError: 0,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "No autorizado",
      resultados: [],
      totalOk: 0,
      totalError: 0,
    };
  }

  // Negocio ACTIVO de la sesión: perfiles.negocio_id quedó deprecada y es NULL
  // para todo usuario invitado.
  const { data: negocioId } = await supabase.rpc("negocio_actual");

  if (!negocioId) {
    return {
      error: "No hay un negocio activo en esta sesión",
      resultados: [],
      totalOk: 0,
      totalError: 0,
    };
  }

  const catalogo = await cargarCatalogoActual(supabase, filas, negocioId);
  if (!catalogo) {
    return {
      error: "No se pudo leer el catálogo. No se importó nada.",
      resultados: [],
      totalOk: 0,
      totalError: 0,
    };
  }

  const plan = construirPlanImport(filas, catalogo);
  const resultados: ResultadoFilaImport[] = [];

  for (const item of plan.items) {
    if (item.errores.length > 0) {
      resultados.push({
        fila: item.fila,
        producto: item.producto,
        ok: false,
        detalle: item.errores.join(" "),
      });
    }
  }

  const items = plan.items.filter((i) => i.errores.length === 0);
  if (!items.length) {
    return {
      error: null,
      resultados: ordenarPorFila(resultados),
      totalOk: 0,
      totalError: resultados.length,
    };
  }

  const atributoCache = await construirCacheAtributosDelArchivo(
    supabase,
    items,
  );

  const productoIdPorClave = new Map<string, string>(
    catalogo.productos.map((p) => [claveProducto(p.nombre), p.id]),
  );
  const varianteIdPorClave = new Map<string, string>(
    catalogo.variantes.map((v) => [
      `${v.productoId}::${claveAtributos(v.atributos)}`,
      v.id,
    ]),
  );
  const nombreDisplayPorVariante = new Map<string, string>(
    catalogo.variantes
      .filter((v) => v.nombreDisplay)
      .map((v) => [v.id, v.nombreDisplay as string]),
  );
  const productoIdPorVariante = new Map<string, string>(
    catalogo.variantes.map((v) => [v.id, v.productoId]),
  );

  const stockFinalPorVariante = new Map<string, number>();
  const productosCreados = new Set<string>();

  for (const item of items) {
    try {
      const productoId = await asegurarProducto(
        supabase,
        item,
        negocioId,
        productoIdPorClave,
        productosCreados,
      );

      const varianteId = await asegurarVariante(
        supabase,
        item,
        productoId,
        negocioId,
        atributoCache,
        varianteIdPorClave,
        nombreDisplayPorVariante,
        productoIdPorVariante,
      );

      const aplicado = await aplicarStock(supabase, item, varianteId);
      if (!aplicado.ok) {
        resultados.push({
          fila: item.fila,
          producto: item.producto,
          ok: false,
          detalle: aplicado.detalle,
        });
        continue;
      }

      stockFinalPorVariante.set(varianteId, aplicado.stockFinal);

      resultados.push({
        fila: item.fila,
        producto: item.producto,
        ok: true,
        detalle: aplicado.detalle,
      });
    } catch (err) {
      console.error(`[IMPORT PRODUCTOS] Fila ${item.fila} falló:`, err);
      resultados.push({
        fila: item.fila,
        producto: item.producto,
        ok: false,
        detalle: mensajeDeError(err),
      });
    }
  }

  await sincronizarEspejoLegacy(
    supabase,
    stockFinalPorVariante,
    nombreDisplayPorVariante,
    productoIdPorVariante,
  );

  await limpiarProductosHuerfanos(supabase, productosCreados);

  revalidatePath("/stock");
  revalidatePath("/store", "layout");

  const ordenados = ordenarPorFila(resultados);
  const totalOk = ordenados.filter((r) => r.ok).length;

  return {
    error: null,
    resultados: ordenados,
    totalOk,
    totalError: ordenados.length - totalOk,
  };
}

function ordenarPorFila(rs: ResultadoFilaImport[]): ResultadoFilaImport[] {
  return [...rs].sort((a, b) => a.fila - b.fila);
}

function mensajeDeError(err: unknown): string {
  const pg = err as { code?: string; message?: string };
  if (pg?.code === "42501") {
    return "No tenés permisos para escribir (política RLS).";
  }
  return pg?.message || "Error inesperado al procesar la fila.";
}

async function construirCacheAtributosDelArchivo(
  supabase: SupabaseDb,
  items: ItemPlan[],
): Promise<AtributoCache> {
  const valoresPorNombre = new Map<string, Set<string>>();
  for (const item of items) {
    for (const [nombre, valor] of Object.entries(item.atributos)) {
      if (!valoresPorNombre.has(nombre)) valoresPorNombre.set(nombre, new Set());
      valoresPorNombre.get(nombre)?.add(valor);
    }
  }

  const opciones = [...valoresPorNombre.entries()].map(([nombre, valores]) => ({
    nombre,
    valores: [...valores],
  }));

  if (!opciones.length) return {};
  return construirCacheAtributos(supabase, opciones);
}

async function asegurarProducto(
  supabase: SupabaseDb,
  item: ItemPlan,
  negocioId: string,
  productoIdPorClave: Map<string, string>,
  productosCreados: Set<string>,
): Promise<string> {
  if (item.varianteId && item.productoId) return item.productoId;

  const clave = claveProducto(item.producto);
  const yaResuelto = productoIdPorClave.get(clave);
  if (yaResuelto) return yaResuelto;

  const tipo = item.categoriaNombre || "General";
  const sufijo = Math.random().toString(36).substring(2, 6);
  const slug = `${slugify(`${item.producto}-${tipo}`)}-${sufijo}`;

  const { data, error } = await supabase
    .from("productos")
    .insert({
      negocio_id: negocioId, // <- INYECTANDO EL NEGOCIO_ID
      nombre: item.producto,
      tipo,
      categoria_id: item.categoriaId,
      descripcion: "",
      precio: item.precioVenta ?? 0,
      precio_costo: item.precioCosto ?? 0,
      slug,
      publicado: true,
      atributos_globales: {},
    })
    .select("id")
    .single();

  if (error || !data) throw error ?? new Error("No se pudo crear el producto.");

  productoIdPorClave.set(clave, data.id as string);
  productosCreados.add(data.id as string);
  return data.id as string;
}

async function asegurarVariante(
  supabase: SupabaseDb,
  item: ItemPlan,
  productoId: string,
  negocioId: string,
  atributoCache: AtributoCache,
  varianteIdPorClave: Map<string, string>,
  nombreDisplayPorVariante: Map<string, string>,
  productoIdPorVariante: Map<string, string>,
): Promise<string> {
  if (item.varianteId) return item.varianteId;

  const valoresCanonicos = canonicalizarValores(item.atributos, atributoCache);
  const claveVariante = `${productoId}::${claveAtributos(item.atributos)}`;

  const yaResuelta = varianteIdPorClave.get(claveVariante);
  if (yaResuelta) return yaResuelta;

  const nombreDisplay =
    Object.values(valoresCanonicos).join(" / ") || "Único";

  const { data, error } = await supabase
    .from("producto_variantes")
    .insert({
      negocio_id: negocioId, // <- INYECTANDO EL NEGOCIO_ID
      producto_id: productoId,
      nombre_display: nombreDisplay,
      atributos: valoresCanonicos,
      precio: null,
      costo: null,
      stock: 0,
      sku: item.codigoBarras,
    })
    .select("id")
    .single();

  if (error || !data) throw error ?? new Error("No se pudo crear la variante.");

  const varianteId = data.id as string;

  const relaciones = Object.entries(item.atributos).flatMap(
    ([nombreOriginal, valorOriginal]) => {
      const entry = atributoCache[nombreOriginal];
      const valorEntry = entry?.valores[valorOriginal];
      if (!entry || !valorEntry) return [];
      return [
        {
          variante_id: varianteId,
          atributo_id: entry.atributoId,
          atributo_valor_id: valorEntry.valorId,
        },
      ];
    },
  );

  if (relaciones.length > 0) {
    const { error: relError } = await supabase
      .from("producto_variante_valores")
      .insert(relaciones);
    if (relError) throw relError;
  }

  varianteIdPorClave.set(claveVariante, varianteId);
  nombreDisplayPorVariante.set(varianteId, nombreDisplay);
  productoIdPorVariante.set(varianteId, productoId);

  return varianteId;
}

interface ResultadoStock {
  ok: boolean;
  detalle: string;
  stockFinal: number;
}

async function aplicarStock(
  supabase: SupabaseDb,
  item: ItemPlan,
  varianteId: string,
): Promise<ResultadoStock> {
  if (item.imei) {
    const { error: imeiError } = await supabase.from("unidades_serie").insert({
      producto_variante_id: varianteId,
      imei: item.imei,
      estado: "disponible",
    });

    if (imeiError) {
      if ((imeiError as { code?: string }).code === "23505") {
        return {
          ok: false,
          detalle: `El IMEI ${item.imei} ya estaba cargado; no se sumó stock.`,
          stockFinal: 0,
        };
      }
      throw imeiError;
    }
  }

  const { data, error } = await supabase.rpc("ajustar_stock_variante", {
    p_variante_id: varianteId,
    p_delta: item.stock,
  });

  if (error) throw error;

  if (!data || data.length === 0) {
    return {
      ok: false,
      detalle:
        "No se pudo ajustar el stock (la variante ya no existe o el stock quedaría negativo).",
      stockFinal: 0,
    };
  }

  const stockFinal = (data as { id: string; stock: number }[])[0].stock;

  return {
    ok: true,
    detalle: item.imei
      ? `IMEI ${item.imei} cargado (+1, stock ${stockFinal}).`
      : `+${item.stock} unidades (stock ${stockFinal}).`,
    stockFinal,
  };
}

async function limpiarProductosHuerfanos(
  supabase: SupabaseDb,
  productosCreados: Set<string>,
) {
  if (productosCreados.size === 0) return;

  try {
    const ids = [...productosCreados];
    const { data, error } = await supabase
      .from("producto_variantes")
      .select("producto_id")
      .in("producto_id", ids);
    if (error) throw error;

    const conVariantes = new Set(
      (data ?? []).map((v) => v.producto_id as string),
    );
    const huerfanos = ids.filter((id) => !conVariantes.has(id));
    if (huerfanos.length === 0) return;

    const { error: deleteError } = await supabase
      .from("productos")
      .delete()
      .in("id", huerfanos);
    if (deleteError) throw deleteError;
  } catch (err) {
    console.error(
      "[IMPORT PRODUCTOS] No se pudieron limpiar productos sin variantes:",
      err,
    );
  }
}

async function sincronizarEspejoLegacy(
  supabase: SupabaseDb,
  stockFinalPorVariante: Map<string, number>,
  nombreDisplayPorVariante: Map<string, string>,
  productoIdPorVariante: Map<string, string>,
) {
  for (const [varianteId, stock] of stockFinalPorVariante) {
    const productoId = productoIdPorVariante.get(varianteId);
    const nombreDisplay = nombreDisplayPorVariante.get(varianteId);
    if (!productoId || !nombreDisplay) continue;

    try {
      const { data: existente, error: selectError } = await supabase
        .from("productos_stock")
        .select("id")
        .eq("producto_id", productoId)
        .eq("variante", nombreDisplay)
        .maybeSingle();
      if (selectError) throw selectError;

      if (existente) {
        const { error } = await supabase
          .from("productos_stock")
          .update({ cantidad: stock })
          .eq("id", existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("productos_stock").insert({
          producto_id: productoId,
          variante: nombreDisplay,
          cantidad: stock,
        });
        if (error) throw error;
      }
    } catch (err) {
      console.error(
        `[IMPORT PRODUCTOS] No se pudo sincronizar productos_stock para "${nombreDisplay}":`,
        err,
      );
    }
  }
}