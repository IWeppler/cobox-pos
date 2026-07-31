"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import type {
  DetalleMedioPago,
  ResumenGerencialCaja,
} from "@/entities/caja/types";

/**
 * Resumen gerencial de un día: ventas, breakdown por medio de pago y estado de
 * caja de TODAS las cajeras.
 *
 * El permiso `caja.ver_gerencial` lo chequea la propia RPC (es SECURITY
 * DEFINER y aborta con 42501 si falta), así que no hace falta repetirlo acá —
 * y sobre todo no alcanza con chequearlo en la UI: esta acción es el borde
 * real por donde salen los datos.
 *
 * @param fecha `YYYY-MM-DD`. Omitir = hoy según la hora del local, que la
 * calcula la base. No mandar `new Date()` del cliente: el navegador de la
 * dueña puede estar en otro huso y partiría la jornada al medio.
 */
export async function getResumenGerencialAction(fecha?: string): Promise<{
  data: ResumenGerencialCaja | null;
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("resumen_gerencial_caja", {
    p_fecha: fecha ?? null,
  });

  if (error) {
    // 42501 = insufficient_privilege: es el rechazo del permiso, no una falla.
    if (error.code === "42501") {
      return { data: null, error: "No tenés permiso para ver esta vista." };
    }
    console.error("Error obteniendo el resumen gerencial de caja:", error);
    return { data: null, error: "No se pudo cargar el resumen del día." };
  }

  return { data: data as ResumenGerencialCaja, error: null };
}

/**
 * Detalle cobro por cobro del día, para el expandible de cada medio de pago.
 * Se trae entero junto con el resumen en vez de una llamada por medio al
 * abrir: son ~200 filas en el peor día de Evens y evita el spinner.
 *
 * Los montos suman exactamente los buckets de `breakdown_medios` — es el mismo
 * conjunto de filas sin agregar, así que si alguna vez no cuadran, el bug está
 * en una de las dos RPC y no en la UI.
 */
export async function getDetalleMediosPagoAction(fecha?: string): Promise<{
  data: DetalleMedioPago[];
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("detalle_medios_pago_dia", {
    p_fecha: fecha ?? null,
  });

  if (error) {
    if (error.code === "42501") {
      return { data: [], error: "No tenés permiso para ver esta vista." };
    }
    console.error("Error obteniendo el detalle por medio de pago:", error);
    return { data: [], error: "No se pudo cargar el detalle del día." };
  }

  return { data: (data ?? []) as DetalleMedioPago[], error: null };
}

/**
 * Facturado por turno, para la fila de nivel "día" del Historial de Cajas.
 * Devuelve un mapa `turno_id -> monto`.
 *
 * NO está gateado por `caja.ver_gerencial`: el historial lo ve cualquier
 * empleado y esto es el total de los turnos que ya puede ver. La RPC repite la
 * condición de visibilidad de la policy de `turnos_caja`, así que un vendedor
 * recibe únicamente los suyos.
 *
 * Si falla, se devuelve `null` en vez de un mapa vacío: un mapa vacío haría que
 * cada día muestre $0, que se lee como "no se vendió nada". `null` hace que la
 * UI muestre S/D.
 */
export async function getTotalesPorTurnoAction(
  turnoIds: string[],
): Promise<Record<string, number> | null> {
  if (turnoIds.length === 0) return {};

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("totales_ventas_por_turno", {
    p_turno_ids: turnoIds,
  });

  if (error) {
    console.error("Error obteniendo totales por turno:", error);
    return null;
  }

  const mapa: Record<string, number> = {};
  for (const fila of (data ?? []) as {
    turno_id: string;
    total_facturado: number;
  }[]) {
    mapa[fila.turno_id] = Number(fila.total_facturado);
  }
  return mapa;
}
