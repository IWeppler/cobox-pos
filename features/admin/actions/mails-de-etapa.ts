"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import { enviarMail } from "@/shared/lib/enviar-mail";
import { urlBaseDeLaRequest } from "@/shared/lib/url-base-request";
import {
  campanaDeEtapa,
  renderizarCampana,
  type MailRenderizado,
} from "@/features/admin/lib/campanas-email";
import type { EtapaAlta } from "@/features/admin/lib/embudo-alta";

/**
 * Mandar el mail que le corresponde a la etapa en la que quedó una persona.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL ORDEN DE LOS PASOS ES EL PUNTO
 *
 * La fila de `envios_email` se inserta ANTES de mandar, no después. Es el
 * mismo criterio que el guard de idempotencia de `aprobar_orden_compra`: el
 * INSERT toma el unique parcial `(usuario_id, campana) where not forzado`, así
 * que dos clicks simultáneos se serializan ahí y el segundo rebota con 23505
 * en vez de mandar el mail dos veces. Chequear antes con un `select` NO sirve:
 * dos llamadas concurrentes leen lo mismo y las dos mandan.
 *
 * Y hace falta además por otro motivo: el link de baja lleva el id del envío,
 * o sea que el id tiene que existir antes de renderizar el cuerpo.
 *
 * Si el proveedor falla, la fila se borra. Un envío que no salió no puede
 * quedar bloqueando el reintento.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUIÉN PUEDE
 *
 * La RLS de `envios_email` (solo super admin). No se repite el chequeo acá: si
 * esto corre para cualquier otro, el INSERT vuelve con 0 filas y la función
 * corta ANTES de mandar nada. Por eso el insert lleva `.select()` y se cuentan
 * las filas — un INSERT filtrado por RLS es un éxito silencioso, que es lo que
 * costó 35 fotos el 5/9/2026.
 */

export interface ResultadoMailEtapa {
  ok: boolean;
  error?: string;
  /** Id que devolvió el proveedor, para rastrear el envío en su panel. */
  proveedorId?: string | null;
}

export async function enviarMailDeEtapaAction(
  usuarioId: string,
  email: string,
  etapa: EtapaAlta,
  opciones: { forzado?: boolean } = {},
): Promise<ResultadoMailEtapa> {
  const destinatario = email?.trim().toLowerCase();
  if (!destinatario) {
    return { ok: false, error: "No sabemos a qué dirección mandarlo." };
  }

  const campana = campanaDeEtapa(etapa);
  if (!campana) {
    // `CREO_NEGOCIO` llegó al final del embudo: no hay nada que pedirle.
    return { ok: false, error: "Esa etapa no tiene mail: ya está adentro." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión vencida." };

  // La baja se consulta SIEMPRE, incluso con `forzado`: reenviar a propósito
  // es saltearse el guard de duplicados, no la voluntad de la persona.
  const { data: baja, error: errorBaja } = await supabase
    .from("email_bajas")
    .select("email")
    .eq("email", destinatario)
    .maybeSingle();

  if (errorBaja) {
    console.error("[MAIL ETAPA] bajas", errorBaja);
    // Fail-closed: si no se puede saber si pidió la baja, no se manda.
    return { ok: false, error: "No se pudo verificar la lista de bajas." };
  }
  if (baja) {
    return { ok: false, error: "Esa persona pidió no recibir más mails." };
  }

  // ── 1. Reservar el envío (guard + id para el link de baja) ───────────────
  const { data: filas, error: errorInsert } = await supabase
    .from("envios_email")
    .insert({
      usuario_id: usuarioId,
      email: destinatario,
      campana: campana.clave,
      etapa,
      forzado: opciones.forzado ?? false,
      enviado_por: user.id,
    })
    .select("id");

  if (errorInsert) {
    if (errorInsert.code === "23505") {
      return { ok: false, error: "Ya se le mandó este mail." };
    }
    console.error("[MAIL ETAPA] insert", errorInsert);
    return { ok: false, error: "No se pudo registrar el envío." };
  }

  const envioId = filas?.[0]?.id as string | undefined;
  if (!envioId) {
    // 0 filas y sin error = la RLS lo filtró. No es un éxito.
    return { ok: false, error: "No tenés permiso para mandar mails." };
  }

  // ── 2. Mandar ────────────────────────────────────────────────────────────
  const cuerpo: MailRenderizado = renderizarCampana(campana, {
    urlBase: await urlBaseDeLaRequest(),
    envioId,
  });

  const envio = await enviarMail({
    para: destinatario,
    asunto: cuerpo.asunto,
    html: cuerpo.html,
    texto: cuerpo.texto,
  });

  if (!envio.ok) {
    // Sacar la reserva: si queda, el reintento choca contra el unique y el
    // mail no sale nunca.
    const { error: errorRollback } = await supabase
      .from("envios_email")
      .delete()
      .eq("id", envioId);

    if (errorRollback) {
      // Peor caso conocido: la fila queda y el reintento va a decir "ya se le
      // mandó" sobre algo que no salió. Se loguea con el id puesto para poder
      // borrarla a mano.
      console.error("[MAIL ETAPA] rollback", { envioId, errorRollback });
    }

    return { ok: false, error: envio.error };
  }

  // ── 3. Anotar el id del proveedor ────────────────────────────────────────
  // Va después y no bloquea: el mail ya salió. Si esto falla, lo único que se
  // pierde es poder rastrearlo en el panel de Resend.
  if (envio.proveedorId) {
    const { error: errorId } = await supabase
      .from("envios_email")
      .update({ proveedor_id: envio.proveedorId })
      .eq("id", envioId);

    if (errorId) console.error("[MAIL ETAPA] proveedor_id", errorId);
  }

  revalidatePath("/admincomerz");
  return { ok: true, proveedorId: envio.proveedorId };
}

export interface EstadoMailsUsuario {
  /** Claves de campaña ya enviadas, por usuario. */
  enviadasPorUsuario: Map<string, Set<string>>;
  /** Direcciones que pidieron no recibir más mails. En minúscula. */
  dadosDeBaja: Set<string>;
}

/**
 * Qué se le mandó ya a cada uno y quién pidió la baja.
 *
 * Las dos consultas están acotadas por RLS al super admin, así que para
 * cualquier otro esto devuelve vacío — que degrada a "no se mandó nada" en vez
 * de romper el panel. Mismo criterio que `getUsuariosPruebaAction`.
 */
export async function getEstadoMailsAction(): Promise<EstadoMailsUsuario> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [envios, bajas] = await Promise.all([
    supabase.from("envios_email").select("usuario_id, campana"),
    supabase.from("email_bajas").select("email"),
  ]);

  if (envios.error) console.error("[MAIL ETAPA] envios", envios.error);
  if (bajas.error) console.error("[MAIL ETAPA] bajas", bajas.error);

  const enviadasPorUsuario = new Map<string, Set<string>>();
  for (const fila of envios.data ?? []) {
    const id = fila.usuario_id as string;
    const set = enviadasPorUsuario.get(id) ?? new Set<string>();
    set.add(fila.campana as string);
    enviadasPorUsuario.set(id, set);
  }

  return {
    enviadasPorUsuario,
    dadosDeBaja: new Set(
      (bajas.data ?? []).map((f) => (f.email as string).toLowerCase()),
    ),
  };
}

/**
 * El mail exacto que saldría, sin mandarlo.
 *
 * Existe para que el botón del panel abra una previsualización: la copia la
 * valida quien vende, y validarla mandándose el mail a uno mismo quema el
 * guard de idempotencia de esa cuenta.
 *
 * El `envioId` es de mentira a propósito — todavía no hay envío — así que el
 * link de baja de la preview no da de baja nada.
 */
export async function previsualizarMailDeEtapaAction(
  etapa: EtapaAlta,
): Promise<MailRenderizado | null> {
  const campana = campanaDeEtapa(etapa);
  if (!campana) return null;

  return renderizarCampana(campana, {
    urlBase: await urlBaseDeLaRequest(),
    envioId: "00000000-0000-0000-0000-000000000000",
  });
}
