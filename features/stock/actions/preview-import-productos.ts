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

/**
 * Resuelve el archivo contra el catálogo real y devuelve el plan a
 * confirmar. NO escribe nada: es la pantalla previa donde se ven los IMEI
 * repetidos y las categorías que no existen ANTES de tocar stock.
 *
 * El plan que devuelve es informativo para la UI, no un contrato de
 * ejecución: confirmarImportProductosAction vuelve a resolver todo contra
 * la base al momento de escribir. Entre el preview y la confirmación otra
 * pestaña puede haber creado el mismo producto, y el server no puede
 * confiar en lo que le manda el cliente — mismo criterio que create-sale.ts
 * con los precios.
 */
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

  const catalogo = await cargarCatalogoActual(supabase, filas);
  if (!catalogo) {
    return {
      error: "No se pudo leer el catálogo para comparar. Probá de nuevo.",
      plan: null,
    };
  }

  return { error: null, plan: construirPlanImport(filas, catalogo) };
}
