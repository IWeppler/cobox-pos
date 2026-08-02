"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import type { FilaImport } from "@/features/stock/lib/parse-productos-csv";
import { cargarCatalogoActual } from "@/features/stock/lib/cargar-catalogo-import";
import {
  construirPlanImport,
  MAX_FILAS_IMPORT,
  type PlanImport,
} from "@/features/stock/lib/import-productos-plan";

export interface PreviewImportResponse {
  error: string | null;
  plan: PlanImport | null;
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

  return { error: null, plan: construirPlanImport(filas, catalogo) };
}
