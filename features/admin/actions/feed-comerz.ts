"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import {
  construirFeed,
  type EventoParaFeed,
  type NegocioParaFeed,
  type NotificacionComerz,
} from "@/features/admin/lib/feed-notificaciones";

/** Cuántos hechos se traen. Los pendientes derivados no tienen tope: son los
 * que hay que atender y esconder uno sería el peor recorte posible. */
const TOPE_EVENTOS = 60;

export async function getFeedComerzAction(): Promise<NotificacionComerz[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: negocios }, { data: eventos }] = await Promise.all([
    supabase
      .from("negocios")
      .select(
        "id, nombre, estado, plan_id, plan_vencimiento, created_at, planes(nombre)",
      ),
    supabase
      .from("eventos_comerz")
      .select("id, negocio_id, tipo, detalle, creado_en, visto_en, negocios(nombre)")
      .order("creado_en", { ascending: false })
      .limit(TOPE_EVENTOS),
  ]);

  const paraFeed: NegocioParaFeed[] = (negocios ?? []).map((n) => {
    const plan = Array.isArray(n.planes) ? n.planes[0] : n.planes;
    return {
      id: n.id as string,
      nombre: n.nombre as string,
      estado: n.estado as string,
      plan_id: (n.plan_id as string | null) ?? null,
      plan_nombre: (plan?.nombre as string | undefined) ?? null,
      plan_vencimiento: (n.plan_vencimiento as string | null) ?? null,
      created_at: n.created_at as string,
    };
  });

  const hechos: EventoParaFeed[] = (eventos ?? []).map((e) => {
    const negocio = Array.isArray(e.negocios) ? e.negocios[0] : e.negocios;
    return {
      id: e.id as string,
      negocio_id: (e.negocio_id as string | null) ?? null,
      negocio: (negocio?.nombre as string | undefined) ?? "Comercio",
      tipo: e.tipo as string,
      detalle: (e.detalle ?? {}) as Record<string, unknown>,
      creado_en: e.creado_en as string,
      visto_en: (e.visto_en as string | null) ?? null,
    };
  });

  // `new Date()` se resuelve acá, en el server: pasarlo como argumento deja
  // `construirFeed` puro y testeable sin congelar el reloj.
  return construirFeed(paraFeed, hechos, new Date());
}

export async function marcarEventoVistoAction(eventoId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("eventos_comerz")
    .update({ visto_en: new Date().toISOString() })
    .eq("id", eventoId)
    .is("visto_en", null);

  if (error) {
    console.error("[FEED COMERZ]", error);
    return { error: "No se pudo marcar como visto.", success: false };
  }

  revalidatePath("/admincomerz");
  return { error: null, success: true };
}

export async function marcarTodoVistoAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("eventos_comerz")
    .update({ visto_en: new Date().toISOString() })
    .is("visto_en", null);

  if (error) {
    console.error("[FEED COMERZ]", error);
    return { error: "No se pudo actualizar.", success: false };
  }

  revalidatePath("/admincomerz");
  return { error: null, success: true };
}
