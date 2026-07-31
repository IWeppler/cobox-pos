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
  /** Qué se hizo, para el reporte final ("Producto creado", "+3 unidades"...). */
  detalle: string;
}

export interface ConfirmarImportResponse {
  error: string | null;
  resultados: ResultadoFilaImport[];
  totalOk: number;
  totalError: number;
}

type SupabaseDb = ReturnType<typeof createClient>;

/**
 * Escribe el import.
 *
 * Recibe las FILAS crudas, no el plan que se le mostró al usuario: el plan
 * se vuelve a construir acá contra la base. Entre el preview y el
 * Confirmar, otra pestaña pudo crear el mismo producto o cargar el mismo
 * IMEI, y un `varianteId` que mande el cliente no es confiable — mismo
 * criterio que create-sale.ts con los precios.
 *
 * Cada fila es independiente: si una falla, las demás NO se revierten
 * (mismo criterio explícito que confirmarCargaAction). El reporte final
 * dice fila por fila qué pasó.
 *
 * IMPORTANTE — no envolver esta acción en `withTimeout` desde el cliente.
 * El timeout solo rechaza la promesa del lado del navegador; el server
 * sigue escribiendo hasta el final, y un reintento suma el stock de nuevo.
 * Es exactamente el incidente del 27/7 en Estilo Bonito (8 reintentos =
 * stock ×8). Ver comentario en features/purchases/ui/merge-table.tsx.
 */
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

  const catalogo = await cargarCatalogoActual(supabase, filas);
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

  // Las filas bloqueadas no se tocan: entran directo al reporte.
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

  // Una sola pasada de normalización de atributos para todo el archivo: sin
  // esto, cada fila repetiría el lookup de "Color"/"Negro" contra la base.
  const atributoCache = await construirCacheAtributosDelArchivo(
    supabase,
    items,
  );

  // Estado que se va llenando a medida que se crean cosas. Arranca con lo
  // que ya existe en la base para no volver a consultar por cada fila.
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

  /** Stock final por variante tocada, para sincronizar el espejo legacy una vez al final. */
  const stockFinalPorVariante = new Map<string, number>();
  /** Productos creados en esta corrida — se despublican si quedan sin ninguna variante. */
  const productosCreados = new Set<string>();

  for (const item of items) {
    try {
      const productoId = await asegurarProducto(
        supabase,
        item,
        productoIdPorClave,
        productosCreados,
      );

      const varianteId = await asegurarVariante(
        supabase,
        item,
        productoId,
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
  revalidatePath("/store");

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

/**
 * Normaliza de una sola vez todas las (propiedad, valor) del archivo
 * contra atributos/atributo_valores, para que el import no introduzca otra
 * variante de casing de una propiedad que ya existe ("color" cuando ya
 * existe "Color").
 */
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
  productoIdPorClave: Map<string, string>,
  productosCreados: Set<string>,
): Promise<string> {
  // Si la fila resolvió contra una variante concreta (match por código de
  // barras), el producto es el de esa variante, no el del nombre.
  if (item.varianteId && item.productoId) return item.productoId;

  const clave = claveProducto(item.producto);
  const yaResuelto = productoIdPorClave.get(clave);
  if (yaResuelto) return yaResuelto;

  // "tipo" es la columna legacy que sigue siendo NOT NULL en la práctica:
  // se llena con el nombre de la categoría, igual que crearProductoAction.
  const tipo = item.categoriaNombre || "General";

  // Mismo esquema de slug que crearProductoAction: sufijo aleatorio para no
  // chocar con el UNIQUE de productos.slug cuando entran dos productos de
  // nombre parecido (o el mismo nombre en dos categorías).
  const sufijo = Math.random().toString(36).substring(2, 6);
  const slug = `${slugify(`${item.producto}-${tipo}`)}-${sufijo}`;

  const { data, error } = await supabase
    .from("productos")
    .insert({
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

  // La variante nace SIEMPRE en 0 y el stock entra después por
  // ajustar_stock_variante, incluso cuando la crea esta misma fila. Nacer
  // con el stock ya puesto haría que un IMEI rechazado por duplicado
  // dejara igual la unidad sumada: la escritura del stock tiene que ser
  // consecuencia del INSERT del IMEI, nunca ir antes.
  const { data, error } = await supabase
    .from("producto_variantes")
    .insert({
      producto_id: productoId,
      nombre_display: nombreDisplay,
      atributos: valoresCanonicos,
      // null = hereda del producto padre. Un precio por variante solo
      // tendría sentido si la planilla trajera precios distintos por
      // color/memoria, y hoy el precio del archivo ya fue al producto.
      precio: null,
      costo: null,
      stock: 0,
      sku: item.codigoBarras,
    })
    .select("id")
    .single();

  if (error || !data) throw error ?? new Error("No se pudo crear la variante.");

  const varianteId = data.id as string;

  // Relación normalizada variante <-> atributo/valor, igual que
  // crearProductoAction. Sin esto la variante existe pero no aparece en el
  // facetado del catálogo.
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

/**
 * Aplica el stock de UNA fila.
 *
 * Con IMEI el orden es deliberado y no se puede invertir: primero el
 * INSERT en unidades_serie, que tiene UNIQUE sobre imei, y recién si ese
 * insert entró se suma la unidad. El UNIQUE hace de guard de idempotencia
 * — importar dos veces el mismo archivo de equipos serializados rebota en
 * el segundo intento en vez de duplicar stock. Es el mismo patrón de
 * "escritura condicional + chequeo ANTES de la escritura derivada" que
 * aprobar_orden_compra y cancel-sale.ts.
 *
 * Sin IMEI no existe ese guard: un import repetido SÍ vuelve a sumar. Es
 * una limitación conocida y está avisada en la UI.
 */
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
      // 23505 = unique_violation. Otra corrida (o esta misma, repetida) ya
      // cargó este aparato: no se suma stock.
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
    // La RPC no afectó ninguna fila: la variante desapareció en el medio, o
    // el delta dejaría el stock en negativo.
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

/**
 * Borra las cabeceras de producto que se crearon en esta corrida pero
 * quedaron sin ninguna variante (la fila creó el producto y después falló
 * al insertar la variante). Un producto publicado sin filas en
 * producto_variantes no se puede vender y no muestra ningún error que lo
 * explique — mismo huérfano que crearProductoAction deshace cuando la
 * grilla de variantes viene vacía.
 */
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

/**
 * Sincroniza el espejo legacy productos_stock, que se relaciona por
 * (producto_id, nombre de variante) y no por variante_id. Se hace una sola
 * vez al final por variante tocada, con el stock que devolvió la RPC — no
 * por fila, que serían N round-trips por el mismo dato.
 *
 * Un fallo acá es drift del espejo, no motivo para marcar filas como
 * fallidas: el stock canónico (producto_variantes.stock) ya quedó bien.
 * Mismo criterio que sincronizarStockLegacy en confirmar-carga.ts.
 */
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
