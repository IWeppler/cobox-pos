"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import type { FilaImport } from "@/features/stock/lib/parse-productos-csv";
import { cargarCatalogoActual } from "@/features/stock/lib/cargar-catalogo-import";
import { PERMISOS, tienePermiso } from "@/shared/lib/permisos";
import { hashPlanillaProductos } from "@/features/stock/lib/hash-import-productos";
import {
  firmarPlanImport,
  type FirmaPlanImport,
} from "@/features/stock/lib/firma-plan-import";
import type { ImportacionPrevia } from "./confirmar-import-productos";
import {
  construirPlanImport,
  MAX_FILAS_IMPORT,
  type PlanImport,
} from "@/features/stock/lib/import-productos-plan";

export interface PreviewImportResponse {
  error: string | null;
  plan: PlanImport | null;
  /** Import anterior del MISMO archivo, si lo hay. El guard real está en la
   * RPC; esto es para avisar ANTES de que el usuario apriete importar. */
  importacionPrevia?: ImportacionPrevia | null;
  /** Firma de ESTE plan. El cliente la guarda y la devuelve al confirmar,
   * que la compara contra el plan recalculado. */
  firma?: FirmaPlanImport | null;
}

export async function previewImportProductosAction(
  filas: FilaImport[],
): Promise<PreviewImportResponse> {
  if (!filas.length) {
    return { error: "El archivo no tiene filas para importar.", plan: null };
  }
  if (filas.length > MAX_FILAS_IMPORT) {
    return {
      error: `El archivo tiene ${filas.length} filas y el máximo es ${MAX_FILAS_IMPORT}. Partilo en varios archivos.`,
      plan: null,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado", plan: null };

  // La preview no escribe, pero lee el catálogo entero del negocio: mismo
  // permiso que el confirmar, así no queda como un endpoint de listado.
  if (!(await tienePermiso(supabase, PERMISOS.STOCK_IMPORTAR_PLANILLA))) {
    return { error: "No tenés permiso para importar planillas.", plan: null };
  }

  // Negocio ACTIVO de la sesión: perfiles.negocio_id quedó deprecada y es NULL
  // para todo usuario invitado.
  const { data: negocioId } = await supabase.rpc("negocio_actual");
  if (!negocioId) {
    return { error: "No hay un negocio activo en esta sesión", plan: null };
  }

  // Pasamos el negocioId para cargar únicamente el catálogo de este tenant
  const catalogo = await cargarCatalogoActual(supabase, filas, negocioId);
  if (!catalogo) {
    return {
      error: "No se pudo leer el catálogo para comparar. Probá de nuevo.",
      plan: null,
    };
  }

  // Aviso temprano de reimportación. Que no encuentre nada NO es garantía de
  // que se pueda importar: el guard que decide es el de la RPC, que corre
  // dentro de la transacción y toma el row lock.
  const { data: previa } = await supabase
    .from("importaciones_productos")
    .select("id, creado_en, nombre_archivo, filas_totales, filas_ok, filas_error")
    .eq("negocio_id", negocioId)
    .eq("hash", hashPlanillaProductos(filas))
    .eq("forzada", false)
    .maybeSingle();

  const plan = construirPlanImport(filas, catalogo);

  return {
    error: null,
    plan,
    importacionPrevia: (previa as ImportacionPrevia | null) ?? null,
    firma: firmarPlanImport(plan),
  };
}
