"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

/**
 * Telemetría de uso: qué acciones usa la gente de verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PARA QUÉ EXISTE
 *
 * Al 8/9/2026 el POS ofrecía dos formas de entregar el comprobante —PDF y
 * WhatsApp— y NO había forma de saber si alguien usaba alguna. No hay un solo
 * `gtag('event', …)` en la app y `eventos_comerz` solo guarda ciclo de vida del
 * SaaS. O sea que mantener, arreglar o tirar el PDF era una discusión sin un
 * dato.
 *
 * Esto responde exactamente esa pregunta, por negocio y por mes.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * NO PUEDE ROMPER NADA. Es un `void` sin excepciones y sin await bloqueante del
 * lado del llamador: si falla el registro del evento, la vendedora igual
 * descarga el PDF. Un contador que rompe la acción que cuenta es peor que no
 * tener el contador.
 *
 * NO GUARDA PLATA NI CLIENTES. El `detalle` lleva contexto de uso —qué botón,
 * desde qué pantalla— y nada más. Para contar ventas está `ventas`.
 */

/** Las formas de entregarle el comprobante al cliente. */
export type MetodoEntregaComprobante = "PDF" | "WHATSAPP" | "IMPRESION";

/** Desde dónde se entregó: el cierre de venta o el historial. */
export type OrigenEntregaComprobante = "POS" | "HISTORIAL";

export async function registrarEntregaComprobanteAction(
  metodo: MetodoEntregaComprobante,
  origen: OrigenEntregaComprobante,
): Promise<void> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // `negocio_id` lo pone el DEFAULT (`security.current_negocio_id()`), que
    // valida contra `usuarios_negocios`. No se manda desde el cliente.
    await supabase.from("eventos_uso").insert({
      tipo: "COMPROBANTE_ENTREGADO",
      detalle: { metodo, origen },
      creado_por: user.id,
    });
  } catch (error) {
    // A propósito: se loguea y se sigue. Ver el comentario de arriba.
    console.error("[TELEMETRIA] No se pudo registrar el uso", error);
  }
}
