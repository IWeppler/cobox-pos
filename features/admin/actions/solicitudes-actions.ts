"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";

export type EstadoSolicitud =
  | "NUEVA"
  | "CONTACTADA"
  | "CONVERTIDA"
  | "DESCARTADA";

export interface SolicitudComercio {
  id: string;
  nombre_contacto: string;
  whatsapp: string;
  nombre_comercio: string;
  rubro: string;
  rubro_otro: string | null;
  estado: EstadoSolicitud;
  notas: string | null;
  creado_en: string;
}

/** Solicitudes de alta. Las policies ya exigen super admin. */
export async function getSolicitudesAction(): Promise<SolicitudComercio[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("solicitudes_comercio")
    .select(
      "id, nombre_contacto, whatsapp, nombre_comercio, rubro, rubro_otro, estado, notas, creado_en",
    )
    // Las nuevas primero: son las que hay que contestar hoy.
    .order("estado", { ascending: true })
    .order("creado_en", { ascending: false });

  if (error) {
    console.error("[GET SOLICITUDES ERROR]", error);
    return [];
  }

  return (data ?? []) as SolicitudComercio[];
}

export async function cambiarEstadoSolicitudAction(
  id: string,
  estado: EstadoSolicitud,
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("solicitudes_comercio")
    .update({ estado })
    .eq("id", id);

  if (error) {
    console.error("[CAMBIAR ESTADO SOLICITUD ERROR]", error);
    return { error: "No se pudo actualizar la solicitud.", success: false };
  }

  revalidatePath("/admincomerz/solicitudes");
  revalidatePath("/admincomerz");
  return { error: null, success: true };
}

export async function guardarNotaSolicitudAction(id: string, notas: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("solicitudes_comercio")
    .update({ notas: notas.trim() || null })
    .eq("id", id);

  if (error) {
    console.error("[GUARDAR NOTA SOLICITUD ERROR]", error);
    return { error: "No se pudo guardar la nota.", success: false };
  }

  revalidatePath("/admincomerz/solicitudes");
  return { error: null, success: true };
}
