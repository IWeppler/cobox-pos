"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export type RemitosPendientesResumen = {
  cantidad: number;
  diasMasAntiguo: number;
  /** id de la orden más antigua sin conciliar — no existe una lista
   * general de remitos (solo /compras/merge/[id] por orden puntual), así
   * que el CTA del Advisor apunta directo a esa. */
  idMasAntiguo: string;
};

/**
 * Resumen de remitos sin conciliar, para el Advisor del dashboard.
 * `estado='PENDIENTE'` es el mismo valor que merge-purchase.ts cambia a
 * 'APROBADA' al terminar la conciliación — no hay un estado intermedio.
 * `creado_en` (momento de subida) es la antigüedad relevante, no
 * `fecha_remito` (fecha del papel, puede ser vieja aunque se suba al toque).
 */
export async function getRemitosPendientesAction(): Promise<RemitosPendientesResumen | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("ordenes_compra")
    .select("id, creado_en")
    .eq("estado", "PENDIENTE");

  if (error) {
    console.error("[getRemitosPendientesAction] Error:", error);
    return null;
  }

  if (!data || data.length === 0) {
    return { cantidad: 0, diasMasAntiguo: 0, idMasAntiguo: "" };
  }

  const ahora = Date.now();
  const masAntiguo = data.reduce((min, o) =>
    new Date(o.creado_en) < new Date(min.creado_en) ? o : min,
  );
  const diasMasAntiguo = Math.floor(
    (ahora - new Date(masAntiguo.creado_en).getTime()) / 86400000,
  );

  return { cantidad: data.length, diasMasAntiguo, idMasAntiguo: masAntiguo.id };
}
