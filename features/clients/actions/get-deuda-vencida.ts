"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export type DeudaVencidaResumen = {
  monto: number;
  clientes: number;
};

/**
 * Resumen de deuda vencida cobrable, para el Advisor del dashboard.
 *
 * Sale de `deuda_cc_vencida`, que imputa los pagos FIFO y devuelve la porción
 * REALMENTE vencida de cada cliente. Antes sumaba `clientes.saldo_pendiente`
 * entero de todo cliente con la fecha pasada, y eso contaba como vencido lo
 * comprado días antes: medido en Evens el 30/8/2026 daba $1.326.050 contra
 * $1.098.825 reales, y una clienta entraba con sus $104.825 teniendo $175
 * atrasados. La tarjeta decía "esto se puede cobrar hoy" sobre plata que
 * todavía no se podía reclamar.
 *
 * El corte por cliente ("cuántos") también cambia: cuenta a quien tiene algo
 * vencido, no a quien tiene la fecha pasada con todo al día.
 */
export async function getDeudaVencidaAction(): Promise<DeudaVencidaResumen | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("deuda_cc_vencida");

  if (error) {
    console.error("[getDeudaVencidaAction] Error:", error);
    return null;
  }

  let monto = 0;
  let clientes = 0;

  for (const fila of (data ?? []) as { vencido: number | string | null }[]) {
    const vencido = Number(fila.vencido ?? 0);
    if (vencido <= 0) continue;
    monto += vencido;
    clientes += 1;
  }

  return { monto, clientes };
}
