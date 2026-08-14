"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";

/**
 * Las solicitudes de cambio de plan, del lado de Comerz.
 *
 * Resolver una solicitud NO cambia el plan del negocio: solo marca el pedido
 * como atendido. El plan se cambia en /admincomerz/negocios, después de
 * acordar el pago. Son dos pasos a propósito — atar el cambio de plan a un
 * click acá haría que marcar "ya lo hablé" active el cobro.
 *
 * Todo pasa por RLS: las policies de `solicitudes_plan` solo dejan leer y
 * actualizar al super admin. Igual se chequea acá, porque un server action es
 * un endpoint.
 */

export interface SolicitudPlanAdmin {
  id: string;
  negocio: string;
  negocio_id: string;
  plan_actual: string | null;
  plan_solicitado_nombre: string;
  modalidad: string;
  nota: string | null;
  creado_en: string;
}

export async function getSolicitudesPendientesAction(): Promise<
  SolicitudPlanAdmin[]
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("solicitudes_plan")
    .select(
      "id, negocio_id, plan_actual, plan_solicitado_nombre, modalidad, nota, creado_en, negocios(nombre)",
    )
    .eq("estado", "PENDIENTE")
    .order("creado_en", { ascending: true });

  if (error) {
    console.error("[SOLICITUDES PLAN]", error);
    return [];
  }

  return (data ?? []).map((fila) => {
    const negocio = Array.isArray(fila.negocios) ? fila.negocios[0] : fila.negocios;
    return {
      id: fila.id as string,
      negocio_id: fila.negocio_id as string,
      negocio: (negocio?.nombre as string | undefined) ?? "Comercio",
      plan_actual: (fila.plan_actual as string | null) ?? null,
      plan_solicitado_nombre: fila.plan_solicitado_nombre as string,
      modalidad: fila.modalidad as string,
      nota: (fila.nota as string | null) ?? null,
      creado_en: fila.creado_en as string,
    };
  });
}

export async function resolverSolicitudPlanAction(
  solicitudId: string,
  estado: "APLICADA" | "RECHAZADA",
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado.", success: false };

  const { error } = await supabase
    .from("solicitudes_plan")
    .update({
      estado,
      resuelto_en: new Date().toISOString(),
      resuelto_por: user.id,
    })
    .eq("id", solicitudId)
    .eq("estado", "PENDIENTE");

  if (error) {
    console.error("[RESOLVER SOLICITUD PLAN]", error);
    return { error: "No se pudo actualizar la solicitud.", success: false };
  }

  revalidatePath("/admincomerz");
  return { error: null, success: true };
}
