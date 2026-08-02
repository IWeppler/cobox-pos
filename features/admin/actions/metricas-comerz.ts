"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";

export interface NegocioAdmin {
  id: string;
  nombre: string;
  slug: string;
  estado: string;
  created_at: string;
  estado_cambiado_en: string;
  plan_id: string | null;
  plan_nombre: string | null;
  plan_precio: number;
  plan_vencimiento: string | null;
  /** Se calcula acá y no en el cliente: comparar contra "ahora" durante el
   * render hace que el componente deje de ser puro. */
  vencido: boolean;
  duenio: string | null;
  usuarios: number;
}

export interface MetricasComerz {
  mrr: number;
  activos: number;
  suspendidos: number;
  sinPlan: number;
  altasSemana: number;
  bajasMes: number;
  porVencer: number;
}

/**
 * Todo lo que necesita el panel de Comerz, en una sola pasada. Las policies ya
 * exigen super admin, así que si alguien más llega acá recibe listas vacías,
 * no datos de otro.
 */
export async function getPanelComerzAction(): Promise<{
  negocios: NegocioAdmin[];
  metricas: MetricasComerz;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: filas }, { data: membresias }] = await Promise.all([
    supabase
      .from("negocios")
      .select(
        "id, nombre, slug, estado, created_at, estado_cambiado_en, plan_id, plan_vencimiento, planes(nombre, precio_mensual)",
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("usuarios_negocios")
      .select("negocio_id, es_owner, perfiles(email)"),
  ]);

  const duenios = new Map<string, string>();
  const cantidadUsuarios = new Map<string, number>();

  for (const m of membresias ?? []) {
    const negocioId = m.negocio_id as string;
    cantidadUsuarios.set(negocioId, (cantidadUsuarios.get(negocioId) ?? 0) + 1);

    if (!m.es_owner) continue;
    const perfil = Array.isArray(m.perfiles) ? m.perfiles[0] : m.perfiles;
    if (perfil?.email) duenios.set(negocioId, perfil.email as string);
  }

  const negocios: NegocioAdmin[] = (filas ?? []).map((n) => {
    const plan = Array.isArray(n.planes) ? n.planes[0] : n.planes;
    return {
      id: n.id as string,
      nombre: n.nombre as string,
      slug: n.slug as string,
      estado: n.estado as string,
      created_at: n.created_at as string,
      estado_cambiado_en: n.estado_cambiado_en as string,
      plan_id: (n.plan_id as string | null) ?? null,
      plan_nombre: (plan?.nombre as string | undefined) ?? null,
      plan_precio: Number(plan?.precio_mensual ?? 0),
      plan_vencimiento: (n.plan_vencimiento as string | null) ?? null,
      vencido: n.plan_vencimiento
        ? new Date(n.plan_vencimiento as string).getTime() < Date.now()
        : false,
      duenio: duenios.get(n.id as string) ?? null,
      usuarios: cantidadUsuarios.get(n.id as string) ?? 0,
    };
  });

  const ahora = Date.now();
  const dias = (d: number) => ahora - d * 24 * 60 * 60 * 1000;

  const activos = negocios.filter((n) => n.estado === "activo");

  const metricas: MetricasComerz = {
    // Solo factura lo que está activo: un negocio suspendido no cobra.
    mrr: activos.reduce((suma, n) => suma + n.plan_precio, 0),
    activos: activos.length,
    suspendidos: negocios.filter((n) => n.estado !== "activo").length,
    sinPlan: activos.filter((n) => !n.plan_id).length,
    altasSemana: negocios.filter(
      (n) => new Date(n.created_at).getTime() >= dias(7),
    ).length,
    // Churn: los que dejaron de estar activos en los últimos 30 días. Se apoya
    // en estado_cambiado_en, que lo mantiene un trigger.
    bajasMes: negocios.filter(
      (n) =>
        n.estado !== "activo" &&
        new Date(n.estado_cambiado_en).getTime() >= dias(30),
    ).length,
    porVencer: activos.filter(
      (n) =>
        n.plan_vencimiento &&
        new Date(n.plan_vencimiento).getTime() <= ahora + 15 * 86400000,
    ).length,
  };

  return { negocios, metricas };
}

export async function getPlanesAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("planes")
    .select("id, nombre, precio_mensual")
    .eq("activo", true)
    .order("precio_mensual", { ascending: true });

  return data ?? [];
}

/** Asigna plan y vencimiento. Solo super admin (lo exige la policy). */
export async function asignarPlanAction(
  negocioId: string,
  planId: string | null,
  meses: number,
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const vencimiento = planId
    ? new Date(Date.now() + meses * 30 * 86400000).toISOString()
    : null;

  const { error } = await supabase
    .from("negocios")
    .update({ plan_id: planId, plan_vencimiento: vencimiento })
    .eq("id", negocioId);

  if (error) {
    console.error("[ASIGNAR PLAN ERROR]", error);
    return { error: "No se pudo asignar el plan.", success: false };
  }

  revalidatePath("/admincomerz");
  revalidatePath("/admincomerz/negocios");
  return { error: null, success: true };
}

/**
 * Suspender corta el acceso del comercio sin borrar nada: su catálogo público
 * deja de resolver y sus usuarios no entran, pero los datos quedan intactos.
 */
export async function cambiarEstadoNegocioAction(
  negocioId: string,
  estado: "activo" | "suspendido" | "cancelado",
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("negocios")
    .update({ estado })
    .eq("id", negocioId);

  if (error) {
    console.error("[CAMBIAR ESTADO NEGOCIO ERROR]", error);
    return { error: "No se pudo cambiar el estado.", success: false };
  }

  revalidatePath("/admincomerz");
  revalidatePath("/admincomerz/negocios");
  return { error: null, success: true };
}
