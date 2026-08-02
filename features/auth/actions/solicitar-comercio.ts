"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { RUBROS } from "@/shared/lib/rubros";

export interface SolicitudState {
  error: string | null;
  success: boolean;
}

/**
 * Alta de un comercio pedida desde el login.
 *
 * No crea cuenta ni negocio: el formulario pide datos de contacto, no email ni
 * contraseña. Queda como solicitud y Comerz la contesta por WhatsApp.
 */
export async function solicitarComercioAction(
  prevState: SolicitudState,
  formData: FormData,
): Promise<SolicitudState> {
  const nombreContacto = String(formData.get("nombre_contacto") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const nombreComercio = String(formData.get("nombre_comercio") ?? "").trim();
  const rubro = String(formData.get("rubro") ?? "").trim();
  const rubroOtro = String(formData.get("rubro_otro") ?? "").trim();

  if (!nombreContacto || !whatsapp || !nombreComercio || !rubro) {
    return { error: "Completá todos los datos para que podamos contactarte.", success: false };
  }

  if (!RUBROS.some((r) => r.valor === rubro)) {
    return { error: "Elegí un rubro de la lista.", success: false };
  }

  if (rubro === "otro" && !rubroOtro) {
    return { error: "Contanos de qué rubro es tu comercio.", success: false };
  }

  // Al menos 8 dígitos: alcanza para descartar un tipeo, sin pelearse con
  // prefijos, guiones ni el 15.
  if (whatsapp.replace(/\D/g, "").length < 8) {
    return { error: "Revisá el número de WhatsApp.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("solicitudes_comercio").insert({
    nombre_contacto: nombreContacto,
    whatsapp,
    nombre_comercio: nombreComercio,
    rubro,
    rubro_otro: rubro === "otro" ? rubroOtro : null,
  });

  if (error) {
    console.error("[SOLICITAR COMERCIO ERROR]", error);
    return {
      error: "No pudimos registrar tu pedido. Probá de nuevo en un rato.",
      success: false,
    };
  }

  return { error: null, success: true };
}
