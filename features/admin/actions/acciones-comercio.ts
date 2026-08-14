"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import { slugify } from "@/shared/utils/slugify";

/**
 * Las acciones que Comerz ejecuta sobre un comercio: cobrar, cambiar el plan,
 * darlo de baja, reactivarlo y cambiarle el link de la tienda.
 *
 * Todas pasan por RLS —`negocios_update_super_admin` y las policies de
 * `pagos_suscripcion`— así que a otro usuario no le hacen nada. El chequeo
 * explícito va igual: un server action es un endpoint.
 *
 * Ninguna registra eventos a mano: los generan los triggers de la base
 * (`trg_evento_negocio`, `trg_evento_pago`). Si el registro dependiera de que
 * cada action se acuerde, el primer camino nuevo dejaría el feed incompleto —
 * y un feed incompleto es peor que ninguno, porque se le cree.
 */

export interface ResultadoAccion {
  error: string | null;
  success: boolean;
}

async function comoSuperAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, autorizado: false };

  const { data } = await supabase.rpc("is_super_admin");
  return { supabase, user, autorizado: data === true };
}

function refrescarPanel() {
  revalidatePath("/admincomerz");
  revalidatePath("/admincomerz/negocios");
}

/**
 * Registra un cobro y mueve el vencimiento del negocio.
 *
 * El vencimiento sale del período que se pagó, no de "hoy + 30": si el pago
 * entra tarde, el mes cubierto sigue siendo el que se pagó y no se le regalan
 * los días de atraso. Y NO se mueve hacia atrás — un pago viejo cargado
 * después no puede acortarle la suscripción a alguien que ya pagó el mes
 * siguiente.
 */
export async function registrarPagoAction(
  _prev: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const negocioId = formData.get("negocio_id") as string;
  const monto = Number(formData.get("monto"));
  const fechaPago = (formData.get("fecha_pago") as string) || null;
  const periodoDesde = formData.get("periodo_desde") as string;
  const periodoHasta = formData.get("periodo_hasta") as string;
  const medio = (formData.get("medio") as string) || "transferencia";
  const nota = ((formData.get("nota") as string) ?? "").trim() || null;

  if (!negocioId || !periodoDesde || !periodoHasta) {
    return { error: "Faltan datos del pago.", success: false };
  }
  if (!Number.isFinite(monto) || monto < 0) {
    return { error: "El monto no es válido.", success: false };
  }
  if (periodoHasta <= periodoDesde) {
    return {
      error: "El período tiene que terminar después de empezar.",
      success: false,
    };
  }

  const { supabase, user, autorizado } = await comoSuperAdmin();
  if (!autorizado) return { error: "No autorizado.", success: false };

  const { data: negocio } = await supabase
    .from("negocios")
    .select("plan_vencimiento, planes(nombre)")
    .eq("id", negocioId)
    .maybeSingle();

  const plan = Array.isArray(negocio?.planes) ? negocio?.planes[0] : negocio?.planes;

  const { error: errorPago } = await supabase.from("pagos_suscripcion").insert({
    negocio_id: negocioId,
    monto,
    fecha_pago: fechaPago ?? new Date().toISOString().slice(0, 10),
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    medio,
    plan_nombre: (plan?.nombre as string | undefined) ?? null,
    nota,
    registrado_por: user?.id ?? null,
  });

  if (errorPago) {
    console.error("[PAGO SUSCRIPCION]", errorPago);
    return { error: "No se pudo registrar el pago.", success: false };
  }

  const vencimientoActual = negocio?.plan_vencimiento
    ? String(negocio.plan_vencimiento).slice(0, 10)
    : null;

  if (!vencimientoActual || periodoHasta > vencimientoActual) {
    const { error: errorVenc } = await supabase
      .from("negocios")
      .update({ plan_vencimiento: periodoHasta })
      .eq("id", negocioId);

    if (errorVenc) {
      // El pago YA quedó registrado: se avisa en vez de fingir que todo salió
      // bien, porque la plata entró y el vencimiento quedó viejo.
      console.error("[PAGO SUSCRIPCION] vencimiento no actualizado", errorVenc);
      return {
        error:
          "El pago quedó registrado pero no se pudo mover el vencimiento. Revisalo.",
        success: false,
      };
    }
  }

  refrescarPanel();
  return { error: null, success: true };
}

/** Cambia el plan. El vencimiento no se toca: cambiar de plan y cobrar son dos
 * cosas distintas, y atarlas haría que corregir un plan mal asignado le regale
 * un mes a alguien. */
export async function cambiarPlanAction(
  negocioId: string,
  planId: string | null,
): Promise<ResultadoAccion> {
  const { supabase, autorizado } = await comoSuperAdmin();
  if (!autorizado) return { error: "No autorizado.", success: false };

  const { error } = await supabase
    .from("negocios")
    .update({ plan_id: planId })
    .eq("id", negocioId);

  if (error) {
    console.error("[CAMBIAR PLAN]", error);
    return { error: "No se pudo cambiar el plan.", success: false };
  }

  refrescarPanel();
  return { error: null, success: true };
}

/**
 * Estado del comercio.
 *
 * 'suspendido' es la falta de pago: el comercio deja de entrar pero NO se
 * borra nada, así que al pagar vuelve exactamente a donde estaba. 'baja' es
 * que se fue. Los datos se conservan en los dos casos — perderlos por una
 * cuota impaga sería un daño irreversible por un problema temporal.
 */
export async function cambiarEstadoNegocioAction(
  negocioId: string,
  estado: "activo" | "suspendido" | "baja",
): Promise<ResultadoAccion> {
  const { supabase, autorizado } = await comoSuperAdmin();
  if (!autorizado) return { error: "No autorizado.", success: false };

  const { error } = await supabase
    .from("negocios")
    .update({ estado, estado_cambiado_en: new Date().toISOString() })
    .eq("id", negocioId);

  if (error) {
    console.error("[CAMBIAR ESTADO]", error);
    return { error: "No se pudo cambiar el estado.", success: false };
  }

  refrescarPanel();
  return { error: null, success: true };
}

/**
 * Cambia el link público de la tienda.
 *
 * El slug viejo NO se pierde: el trigger `trg_evento_negocio` lo guarda en
 * `slugs_historicos` para que el link que el comercio ya compartió siga
 * entrando y redirija al nuevo. Un catálogo vive meses en chats de WhatsApp.
 */
export async function cambiarSlugAction(
  negocioId: string,
  slugCrudo: string,
): Promise<ResultadoAccion> {
  const slug = slugify(slugCrudo ?? "");

  if (slug.length < 3) {
    return { error: "El link tiene que tener al menos 3 caracteres.", success: false };
  }

  const { supabase, autorizado } = await comoSuperAdmin();
  if (!autorizado) return { error: "No autorizado.", success: false };

  // Se avisa antes en vez de dejar que reviente el unique: el mensaje de la
  // base para esto no le dice nada a nadie.
  const { data: ocupado } = await supabase
    .from("negocios")
    .select("id")
    .eq("slug", slug)
    .neq("id", negocioId)
    .maybeSingle();

  if (ocupado) {
    return { error: `El link "${slug}" ya lo usa otro comercio.`, success: false };
  }

  const { error } = await supabase
    .from("negocios")
    .update({ slug })
    .eq("id", negocioId);

  if (error) {
    console.error("[CAMBIAR SLUG]", error);
    return { error: "No se pudo cambiar el link.", success: false };
  }

  refrescarPanel();
  return { error: null, success: true };
}

export interface PagoDelNegocio {
  id: string;
  monto: number;
  fecha_pago: string;
  periodo_desde: string;
  periodo_hasta: string;
  medio: string;
  plan_nombre: string | null;
  nota: string | null;
}

export async function getPagosDelNegocioAction(
  negocioId: string,
): Promise<PagoDelNegocio[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("pagos_suscripcion")
    .select(
      "id, monto, fecha_pago, periodo_desde, periodo_hasta, medio, plan_nombre, nota",
    )
    .eq("negocio_id", negocioId)
    .order("fecha_pago", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id as string,
    monto: Number(p.monto ?? 0),
    fecha_pago: p.fecha_pago as string,
    periodo_desde: p.periodo_desde as string,
    periodo_hasta: p.periodo_hasta as string,
    medio: p.medio as string,
    plan_nombre: (p.plan_nombre as string | null) ?? null,
    nota: (p.nota as string | null) ?? null,
  }));
}
