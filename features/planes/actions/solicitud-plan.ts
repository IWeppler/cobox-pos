"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import type { Modalidad } from "@/shared/lib/planes";

/**
 * Solicitudes de cambio de plan.
 *
 * El comercio pide, Comerz aplica. La solicitud NO cambia el plan sola, y eso
 * es deliberado: el plan se cambia cuando el pago está acordado, y ese acuerdo
 * pasa fuera del sistema. Un botón que se auto-asigna el plan de arriba sería
 * regalar el producto.
 *
 * Reemplaza al `mailto:` que había antes, que abría el cliente de correo del
 * sistema — en una PC con Outlook sin configurar eso es una ventana de
 * configuración de cuenta, y el pedido nunca llegaba a ningún lado. Acá queda
 * una fila que se ve en /admincomerz.
 */

export interface SolicitudPlan {
  id: string;
  plan_solicitado_nombre: string;
  modalidad: string;
  estado: string;
  creado_en: string;
}

export interface SolicitudPlanState {
  error: string | null;
  success: boolean;
}

export async function crearSolicitudPlanAction(
  _prevState: SolicitudPlanState | null,
  formData: FormData,
): Promise<SolicitudPlanState> {
  const planId = (formData.get("plan_solicitado_id") as string) || null;
  const planNombre = ((formData.get("plan_solicitado_nombre") as string) ?? "").trim();
  const modalidad = ((formData.get("modalidad") as string) ?? "mensual") as Modalidad;
  const nota = ((formData.get("nota") as string) ?? "").trim() || null;

  if (!planNombre) {
    return { error: "Elegí a qué plan querés pasar.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado.", success: false };

  const [{ data: negocioId }, { data: esAdmin }] = await Promise.all([
    supabase.rpc("negocio_actual"),
    supabase.rpc("is_admin"),
  ]);

  if (!negocioId) {
    return { error: "No se pudo identificar el comercio.", success: false };
  }
  // El botón está en el perfil del dueño, pero un server action es un
  // endpoint: el chequeo va acá igual, no solo en la pantalla.
  if (!esAdmin) {
    return {
      error: "Solo el administrador del comercio puede pedir un cambio de plan.",
      success: false,
    };
  }

  // El plan actual se congela en la fila: si el cambio se aplica dos semanas
  // después, la solicitud tiene que seguir diciendo desde dónde se pidió.
  const { data: negocio } = await supabase
    .from("negocios")
    .select("planes(nombre)")
    .eq("id", negocioId)
    .maybeSingle();
  const planActivo = Array.isArray(negocio?.planes)
    ? negocio?.planes[0]
    : negocio?.planes;

  const { error } = await supabase.from("solicitudes_plan").insert({
    negocio_id: negocioId,
    plan_actual: (planActivo?.nombre as string | undefined) ?? null,
    plan_solicitado_id: planId,
    plan_solicitado_nombre: planNombre,
    modalidad,
    nota,
    solicitado_por: user.id,
  });

  if (error) {
    // 23505 = el índice único parcial de una sola solicitud PENDIENTE por
    // negocio. No es un error del usuario: ya pidió y todavía no se resolvió.
    if (error.code === "23505") {
      return {
        error:
          "Ya tenés un pedido de cambio de plan en curso. Te escribimos apenas lo veamos.",
        success: false,
      };
    }
    console.error("[SOLICITUD PLAN]", error);
    return { error: "No se pudo enviar el pedido. Probá de nuevo.", success: false };
  }

  revalidatePath("/perfil");
  return { error: null, success: true };
}

/** La solicitud pendiente del negocio activo, si hay. */
export async function getSolicitudPendienteAction(): Promise<SolicitudPlan | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("solicitudes_plan")
    .select("id, plan_solicitado_nombre, modalidad, estado, creado_en")
    .eq("estado", "PENDIENTE")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as SolicitudPlan | null) ?? null;
}
