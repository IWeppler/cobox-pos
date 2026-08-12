"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { invalidarCatalogo } from "@/shared/lib/cache-catalogo";
import { createClient } from "@/shared/config/supabase/server";
import {
  construirCacheAtributos,
  type AtributoCache,
} from "@/features/stock/lib/normalize-atributo";
import type { FilaImport } from "@/features/stock/lib/parse-productos-csv";
import {
  construirPlanImport,
  MAX_FILAS_IMPORT,
  type ItemPlan,
  type PlanImport,
} from "@/features/stock/lib/import-productos-plan";
import {
  filasQueCambiaron,
  firmaDesactualizada,
  firmarPlanImport,
  type FirmaPlanImport,
} from "@/features/stock/lib/firma-plan-import";
import { construirPayloadImport } from "@/features/stock/lib/import-productos-payload";
import { hashPlanillaProductos } from "@/features/stock/lib/hash-import-productos";
import { cargarCatalogoActual } from "@/features/stock/lib/cargar-catalogo-import";
import { PERMISOS, tienePermiso } from "@/shared/lib/permisos";

export interface ResultadoFilaImport {
  fila: number;
  producto: string;
  ok: boolean;
  detalle: string;
}

/** Import anterior del MISMO archivo, para poder decir cuándo y con qué saldo. */
export interface ImportacionPrevia {
  id: string;
  creado_en: string;
  nombre_archivo: string | null;
  filas_totales: number;
  filas_ok: number;
  filas_error: number;
}

export interface ConfirmarImportResponse {
  error: string | null;
  resultados: ResultadoFilaImport[];
  totalOk: number;
  totalError: number;
  /** true = no se escribió NADA porque este archivo ya se había importado. */
  yaImportada?: boolean;
  importacionPrevia?: ImportacionPrevia | null;
  /** true = no se escribió NADA porque el catálogo cambió desde la preview.
   * Vienen el plan recalculado y las filas que cambiaron, para re-aprobar. */
  planDesactualizado?: boolean;
  plan?: PlanImport | null;
  filasCambiadas?: number[];
  firma?: FirmaPlanImport | null;
}

type SupabaseDb = ReturnType<typeof createClient>;

function respuestaConError(error: string): ConfirmarImportResponse {
  return { error, resultados: [], totalOk: 0, totalError: 0 };
}

/**
 * Escribe la planilla completa.
 *
 * TODA la escritura vive en la RPC `importar_productos_planilla`: una sola
 * llamada, una transacción, cada fila atómica. Antes esta action tenía un
 * `for` con `await` adentro que hacía hasta 5 round-trips por fila más el
 * loop del espejo legacy — ~10.000 viajes con un archivo en el tope de 3000
 * filas, y un corte a la mitad dejaba medio archivo escrito.
 *
 * Lo único que se sigue haciendo desde Node es la canonicalización de
 * atributos (`construirCacheAtributos`), a propósito y por el mismo motivo
 * que en el merge de remitos: es criterio compartido con la carga manual y
 * no se replica en SQL. Esa parte SÍ escribe (filas de `atributos` /
 * `atributo_valores`) antes de la transacción — son entradas de diccionario,
 * no stock, y quedar creadas sin uso no descuadra nada.
 */
export async function confirmarImportProductosAction(
  filas: FilaImport[],
  opciones: {
    nombreArchivo?: string;
    forzar?: boolean;
    firmaPlan?: FirmaPlanImport | null;
  } = {},
): Promise<ConfirmarImportResponse> {
  if (!filas.length) {
    return respuestaConError("El archivo no tiene filas para importar.");
  }
  if (filas.length > MAX_FILAS_IMPORT) {
    return respuestaConError(
      `El archivo tiene ${filas.length} filas y el máximo es ${MAX_FILAS_IMPORT}.`,
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return respuestaConError("No autorizado");

  // El botón solo se le muestra a un ADMIN, pero un server action es un
  // endpoint: sin este chequeo cualquiera con sesión podía llamarlo y
  // escribir stock. tienePermiso es fail-closed.
  if (!(await tienePermiso(supabase, PERMISOS.STOCK_IMPORTAR_PLANILLA))) {
    return respuestaConError("No tenés permiso para importar planillas.");
  }

  // Negocio ACTIVO de la sesión: perfiles.negocio_id quedó deprecada y es NULL
  // para todo usuario invitado.
  const { data: negocioId } = await supabase.rpc("negocio_actual");
  if (!negocioId) {
    return respuestaConError("No hay un negocio activo en esta sesión");
  }

  const catalogo = await cargarCatalogoActual(supabase, filas, negocioId);
  if (!catalogo) {
    return respuestaConError("No se pudo leer el catálogo. No se importó nada.");
  }

  const plan = construirPlanImport(filas, catalogo);

  // ── PLAN FIRMADO ──────────────────────────────────────────────────────
  // El plan que se aprobó en la preview se armó contra una foto del catálogo
  // de hace unos minutos. Este se acaba de armar contra la de ahora. Si no
  // dan lo mismo, alguien tocó el catálogo en el medio y lo que se escribiría
  // no es lo que el usuario miró: no se escribe nada y se devuelve el plan
  // nuevo con las filas que cambiaron para que las apruebe de nuevo.
  const firmaActual = firmarPlanImport(plan);
  if (firmaDesactualizada(opciones.firmaPlan, firmaActual)) {
    return {
      error: null,
      resultados: [],
      totalOk: 0,
      totalError: 0,
      planDesactualizado: true,
      plan,
      filasCambiadas: filasQueCambiaron(opciones.firmaPlan, firmaActual),
      firma: firmaActual,
    };
  }

  // Las filas que el plan ya rechazó no viajan a la RPC: su resultado se
  // arma acá con el mismo texto de error que vio el usuario en la preview.
  const resultadosPrevios: ResultadoFilaImport[] = plan.items
    .filter((i) => i.errores.length > 0)
    .map((i) => ({
      fila: i.fila,
      producto: i.producto,
      ok: false,
      detalle: i.errores.join(" "),
    }));

  const items = plan.items.filter((i) => i.errores.length === 0);
  if (!items.length) {
    return {
      error: null,
      resultados: ordenarPorFila(resultadosPrevios),
      totalOk: 0,
      totalError: resultadosPrevios.length,
    };
  }

  let atributoCache: AtributoCache;
  try {
    atributoCache = await construirCacheAtributosDelArchivo(supabase, items);
  } catch (err) {
    console.error("[IMPORT PRODUCTOS] Error normalizando atributos:", err);
    return respuestaConError(
      "No se pudieron normalizar los atributos del archivo. No se importó nada.",
    );
  }

  const payload = construirPayloadImport(items, atributoCache);

  // El hash se calcula sobre TODAS las filas parseadas, no solo sobre las que
  // se van a escribir: el archivo es el mismo archivo aunque algunas filas
  // estén rechazadas.
  const { data, error } = await supabase.rpc("importar_productos_planilla", {
    p_negocio_id: negocioId,
    p_items: payload,
    p_hash: hashPlanillaProductos(filas),
    p_nombre_archivo: opciones.nombreArchivo ?? null,
    p_forzar: opciones.forzar ?? false,
  });

  if (error) {
    console.error("[IMPORT PRODUCTOS] La transacción falló:", error);
    return respuestaConError(
      mensajeDeError(error) + " No se importó ninguna fila.",
    );
  }

  const respuesta = data as {
    resultados?: ResultadoFilaImport[];
    ya_importada?: boolean;
    importacion_previa?: ImportacionPrevia | null;
  } | null;

  // Guard del server: el archivo ya se había importado y no vino `forzar`.
  // No se escribió nada — la UI ofrece el botón de importar igual.
  if (respuesta?.ya_importada) {
    return {
      error: null,
      resultados: [],
      totalOk: 0,
      totalError: 0,
      yaImportada: true,
      importacionPrevia: respuesta.importacion_previa ?? null,
    };
  }
  const resultados = ordenarPorFila([
    ...resultadosPrevios,
    ...(respuesta?.resultados ?? []),
  ]);
  const totalOk = resultados.filter((r) => r.ok).length;

  revalidatePath("/stock");
  revalidatePath("/store", "layout");
  invalidarCatalogo(negocioId);

  return {
    error: null,
    resultados,
    totalOk,
    totalError: resultados.length - totalOk,
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
  return pg?.message || "Error inesperado al importar.";
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
