import "server-only";

/**
 * El único lugar que le habla al proveedor de mail.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ALCANZABA CON LO QUE YA HABÍA
 *
 * Supabase manda mails, pero solo los suyos: confirmación, magic link,
 * invitación y recuperación de contraseña. No hay forma de pedirle que mande
 * un cuerpo propio. Todo lo que no sea auth necesita un proveedor aparte, y
 * este módulo es esa puerta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ `fetch` Y NO EL PAQUETE DE RESEND
 *
 * Es un POST con un JSON. El SDK agrega una dependencia y un reintento propio
 * que acá no se quiere: un mail que se reintenta solo es un mail que sale dos
 * veces, y quien decide reintentar es la persona que apretó el botón.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NUNCA LANZA
 *
 * Devuelve el resultado, igual que `emitir-comprobante.ts`. Quien llama tiene
 * que poder distinguir "no salió" de "salió" para decidir si registra el
 * envío, y una excepción se convierte en un catch que se olvida de eso.
 */

const API = "https://api.resend.com/emails";

/**
 * Quién firma. Tiene que ser una dirección de un dominio VERIFICADO en Resend
 * (SPF + DKIM): con una que no lo esté, el envío rebota con 403 y el mail no
 * sale. El `reply-to` va aparte porque las campañas invitan a responder, y las
 * respuestas tienen que llegar a una casilla que alguien lee.
 */
const REMITENTE = process.env.MAIL_REMITENTE?.trim() || "Comerz <noreply@comerz.app>";
const RESPONDER_A = process.env.MAIL_RESPONDER_A?.trim() || null;

export interface MailAEnviar {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

export type ResultadoEnvio =
  | { ok: true; proveedorId: string | null }
  | { ok: false; error: string };

export async function enviarMail(mail: MailAEnviar): Promise<ResultadoEnvio> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  // Sin la clave no se puede mandar nada, y decirlo con todas las letras es la
  // diferencia entre configurar una variable y salir a debuggear la app.
  if (!apiKey) {
    return {
      ok: false,
      error: "Falta RESEND_API_KEY. Sin eso no se puede mandar ningún mail.",
    };
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [mail.para],
        subject: mail.asunto,
        html: mail.html,
        // Los dos cuerpos en el mismo envío: el cliente elige cuál mostrar, y
        // un mail sin versión de texto puntúa peor en los filtros de spam.
        text: mail.texto,
        ...(RESPONDER_A ? { reply_to: RESPONDER_A } : {}),
      }),
    });

    const cuerpo = (await res.json().catch(() => null)) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;

    if (!res.ok) {
      const detalle = cuerpo?.message ?? `HTTP ${res.status}`;
      console.error("[MAIL]", { status: res.status, cuerpo });
      return { ok: false, error: detalle };
    }

    return { ok: true, proveedorId: cuerpo?.id ?? null };
  } catch (e) {
    console.error("[MAIL] excepción", e);
    return { ok: false, error: "No se pudo contactar al proveedor de mail." };
  }
}
