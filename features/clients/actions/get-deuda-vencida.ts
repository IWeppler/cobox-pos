"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { calcularDiasVencido } from "@/features/clients/lib/calcular-dias-vencido";

export type DeudaVencidaResumen = {
  monto: number;
  clientes: number;
};

/**
 * Resumen de deuda vencida cobrable, para el Advisor del dashboard.
 * `clientes.saldo_pendiente` + `fecha_vencimiento_deuda` ya son el caché
 * mantenido por manage-clients.ts (recalculado en cada movimiento de CC) —
 * se lee directo de ahí en vez de recorrer `ventas`, mismo criterio que
 * calcularSaldoConRecargo. "Vencido" = fecha_vencimiento_deuda ya pasada,
 * misma función que usa el resto de la feature de clientes.
 */
export async function getDeudaVencidaAction(): Promise<DeudaVencidaResumen | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("clientes")
    .select("id, saldo_pendiente, fecha_vencimiento_deuda")
    .gt("saldo_pendiente", 0);

  if (error) {
    console.error("[getDeudaVencidaAction] Error:", error);
    return null;
  }

  let monto = 0;
  let clientes = 0;

  for (const c of data || []) {
    const diasVencido = calcularDiasVencido(c.fecha_vencimiento_deuda);
    if (diasVencido === null || diasVencido <= 0) continue;
    monto += Number(c.saldo_pendiente || 0);
    clientes += 1;
  }

  return { monto, clientes };
}
