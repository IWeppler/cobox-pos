"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import type { FilaFunnel } from "@/features/admin/lib/funnel";

/**
 * Los hechos crudos del funnel, por negocio.
 *
 * La RPC devuelve fechas y conteos, NO métricas: qué cuenta como activado, a
 * quién se excluye del promedio y quién está en riesgo se decide en
 * `funnel.ts`, que tiene tests. Una cuenta con criterio adentro de un `select`
 * es una cuenta que nadie va a poder revisar después.
 */
export async function getFunnelAction(): Promise<FilaFunnel[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("funnel_comerz");

  if (error) {
    console.error("[FUNNEL COMERZ]", error);
    return [];
  }

  return (data ?? []).map((f: Record<string, unknown>): FilaFunnel => ({
    id: f.id as string,
    nombre: f.nombre as string,
    estado: f.estado as string,
    alta: f.alta as string,
    primeraVenta: (f.primera_venta as string | null) ?? null,
    ultimaVenta: (f.ultima_venta as string | null) ?? null,
    ventasTotal: Number(f.ventas_total ?? 0),
    pagos: Number(f.pagos ?? 0),
    primerPago: (f.primer_pago as string | null) ?? null,
  }));
}
