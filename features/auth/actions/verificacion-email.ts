"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { urlBaseDeLaRequest } from "@/shared/lib/url-base-request";

export interface EnvioVerificacionState {
  ok: boolean;
  mensaje: string;
}

/**
 * Manda (o vuelve a mandar) el mail para verificar el correo.
 *
 * Existe porque la verificación dejó de bloquear el alta: si no frena, tiene
 * que haber un botón para pedirla de nuevo — el mail se pierde, cae en spam, o
 * la persona se registra y recién a la semana se acuerda.
 *
 * Prueba DOS caminos y no uno, porque cuál funciona depende de una opción del
 * proyecto que no vive en el código:
 *
 *   1. `resend({ type: "signup" })` es el correcto mientras "Confirm email"
 *      esté PRENDIDO en Supabase: reenvía el mail de confirmación original.
 *   2. Con la confirmación APAGADA —que es como queda el alta directa— ese
 *      reenvío no aplica, y el equivalente es un magic link: al abrirlo,
 *      Supabase marca `email_confirmed_at`, que es exactamente lo que se
 *      quería confirmar.
 *
 * Intentar el primero y caer al segundo evita que este botón quede muerto el
 * día que se toque esa opción en el dashboard, en cualquiera de las dos
 * direcciones. Ese día nadie se va a acordar de este archivo.
 */
export async function enviarVerificacionEmailAction(
  email: string,
): Promise<EnvioVerificacionState> {
  const destinatario = email?.trim().toLowerCase();

  if (!destinatario) {
    return { ok: false, mensaje: "No sabemos a qué dirección mandarlo." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const redirect = `${await urlBaseDeLaRequest()}/auth/callback?next=/`;

  const { error: errorResend } = await supabase.auth.resend({
    type: "signup",
    email: destinatario,
    options: { emailRedirectTo: redirect },
  });

  if (!errorResend) {
    return { ok: true, mensaje: "Listo, te lo mandamos de nuevo." };
  }

  const { error: errorOtp } = await supabase.auth.signInWithOtp({
    email: destinatario,
    options: {
      // NO crear la cuenta desde acá: este botón es para una que ya existe.
      // Con `true`, un mail mal tipeado daría de alta un usuario fantasma.
      shouldCreateUser: false,
      emailRedirectTo: redirect,
    },
  });

  if (!errorOtp) {
    return { ok: true, mensaje: "Listo, te mandamos el link de verificación." };
  }

  console.error("[VERIFICACION EMAIL]", { errorResend, errorOtp });

  // El error más frecuente acá no es un bug sino el límite de envíos del SMTP
  // de Supabase, y decir "esperá un minuto" es accionable; "algo salió mal",
  // no.
  const esRateLimit =
    /rate|limit|seconds|too many/i.test(errorOtp.message ?? "") ||
    /rate|limit|seconds|too many/i.test(errorResend.message ?? "");

  return {
    ok: false,
    mensaje: esRateLimit
      ? "Esperá un minuto antes de pedirlo otra vez."
      : "No pudimos mandarlo ahora. Probá de nuevo en un rato.",
  };
}
