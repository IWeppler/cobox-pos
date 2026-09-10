"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import { enviarMail } from "@/shared/lib/enviar-mail";
import { urlBaseDeLaRequest } from "@/shared/lib/url-base-request";
import { renderizarCampana, type MailRenderizado } from "@/features/admin/lib/campanas-email";
import {
  campanaQueCorresponde,
  claveDeEnvio,
  construirCampanaNegocio,
  type ClaveCampanaNegocio,
  type NegocioEnCiclo,
} from "@/features/admin/lib/campanas-negocio";

/**
 * Los mails del ciclo de vida del comercio: fin de prueba, prueba vencida,
 * cobro e inactividad.
 *
 * Hermano de `mails-de-etapa.ts`, que cubre el tramo de antes (el que todavía
 * no tiene negocio). Comparten la tabla `envios_email`, el guard de
 * idempotencia y el proveedor; lo que cambia es de dónde salen los hechos y
 * quién es el destinatario — acá, el DUEÑO del comercio.
 */

/**
 * Link de respaldo, para el plan que todavía no tiene el suyo cargado en
 * `planes.link_suscripcion`.
 *
 * El link que vale es el DEL PLAN: el importe de una suscripción de Mercado
 * Pago es fijo, así que hay uno por plan y un link único mandaría al de
 * Empresa a adherirse al precio de Emprendedor. Este de acá sirve para un link
 * de pago suelto —donde el importe lo pone quien paga— y para no dejar sin
 * mail al plan que todavía no se cargó.
 */
const LINK_DE_PAGO = process.env.MERCADOPAGO_LINK_PAGO?.trim() || null;
/** Alias de Mercado Pago, la segunda opcion para el que no quiere debito automatico. */
const ALIAS_MP = process.env.MERCADOPAGO_ALIAS?.trim() || null;

function mapear(f: Record<string, unknown>): NegocioEnCiclo {
  return {
    negocioId: f.negocio_id as string,
    nombre: (f.nombre as string) ?? "",
    estado: (f.estado as string) ?? "",
    creado: f.creado as string,
    planVencimiento: (f.plan_vencimiento as string | null) ?? null,
    planNombre: (f.plan_nombre as string | null) ?? null,
    planPrecio: f.plan_precio === null ? null : Number(f.plan_precio),
    planLink: (f.plan_link as string | null) ?? null,
    duenioId: (f.duenio_id as string | null) ?? null,
    duenioEmail: (f.duenio_email as string | null) ?? null,
    productos: Number(f.productos ?? 0),
    ventas: Number(f.ventas ?? 0),
    ultimaVenta: (f.ultima_venta as string | null) ?? null,
    pagos: Number(f.pagos ?? 0),
  };
}

/**
 * Los hechos de cada comercio. El corte de acceso vive en la BASE (la función
 * es SECURITY DEFINER con `where security.is_super_admin()`): para cualquier
 * otro devuelve cero filas en vez de datos.
 */
export async function getCicloNegociosAction(): Promise<NegocioEnCiclo[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("ciclo_de_vida_negocios");

  if (error) {
    console.error("[CICLO NEGOCIOS]", error);
    return [];
  }

  return (data ?? []).map(mapear);
}

/**
 * Si existe un link de pago de RESPALDO.
 *
 * La UI lo usa solo para el cartel general. Que un comercio puntual pueda
 * cobrarse o no lo decide el link de SU plan, y eso viaja en la fila
 * (`planLink`): un plan con su link de suscripción cargado manda el mail
 * aunque esta variable no exista.
 */
export async function hayLinkDePagoAction(): Promise<boolean> {
  return LINK_DE_PAGO !== null;
}

export interface ResultadoMailNegocio {
  ok: boolean;
  error?: string;
  proveedorId?: string | null;
}

/**
 * Manda el mail que le corresponde HOY al dueño de este comercio.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO SE CONFÍA EN LO QUE MANDA EL CLIENTE
 *
 * Recibe la clave que la pantalla creía que correspondía, pero vuelve a pedir
 * los hechos y la recalcula. Si no coinciden, no manda: la pantalla puede
 * llevar veinte minutos abierta, y en el medio el comercio pudo pagar. Mandarle
 * "quedó pendiente tu pago" a alguien que acaba de pagar es peor que no
 * mandarle nada. Es el mismo criterio que el plan firmado del importador.
 *
 * El resto del orden es el de `mails-de-etapa.ts` y por los mismos motivos: la
 * fila se inserta ANTES de mandar (es el guard de idempotencia y de ahí sale el
 * id del link de baja), y si el proveedor falla se borra.
 */
export async function enviarMailDeNegocioAction(
  negocioId: string,
  claveEsperada: ClaveCampanaNegocio,
): Promise<ResultadoMailNegocio> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión vencida." };

  const { data, error } = await supabase.rpc("ciclo_de_vida_negocios");
  if (error) {
    console.error("[CICLO NEGOCIOS] envío", error);
    return { ok: false, error: "No se pudieron leer los datos del comercio." };
  }

  const negocio = (data ?? []).map(mapear).find(
    (n: NegocioEnCiclo) => n.negocioId === negocioId,
  );
  if (!negocio) {
    // Cero filas también es lo que devuelve la función para quien no es super
    // admin: no hay forma de distinguirlas y las dos terminan igual.
    return { ok: false, error: "No encontramos ese comercio." };
  }

  const ahora = new Date();
  const claveReal = campanaQueCorresponde(negocio, ahora);

  if (claveReal !== claveEsperada) {
    return {
      ok: false,
      error: claveReal
        ? "Cambió la situación del comercio: recargá y fijate qué le toca ahora."
        : "Ya no le corresponde ningún mail. Recargá la pantalla.",
    };
  }

  if (!negocio.duenioEmail || !negocio.duenioId) {
    return { ok: false, error: "Ese comercio no tiene un dueño con mail." };
  }

  const destinatario = negocio.duenioEmail.toLowerCase();

  const campana = construirCampanaNegocio(claveReal, negocio, {
    ahora,
    linkDePago: LINK_DE_PAGO,
    alias: ALIAS_MP,
  });
  if (!campana) {
    return {
      ok: false,
      error:
        "Ese plan no tiene link de suscripción cargado (planes.link_suscripcion) y tampoco hay uno de respaldo: un aviso de cobro sin cómo pagar no se manda.",
    };
  }

  // La baja se respeta siempre.
  const { data: baja, error: errorBaja } = await supabase
    .from("email_bajas")
    .select("email")
    .eq("email", destinatario)
    .maybeSingle();

  if (errorBaja) {
    console.error("[CICLO NEGOCIOS] bajas", errorBaja);
    return { ok: false, error: "No se pudo verificar la lista de bajas." };
  }
  if (baja) {
    return { ok: false, error: "Esa persona pidió no recibir más mails." };
  }

  // Las de cobro se repiten todos los meses, así que su clave lleva el período
  // del vencimiento. Ver `claveDeEnvio`.
  const clavePersistida = claveDeEnvio(claveReal, negocio);

  const { data: filas, error: errorInsert } = await supabase
    .from("envios_email")
    .insert({
      usuario_id: negocio.duenioId,
      email: destinatario,
      campana: clavePersistida,
      etapa: negocio.estado,
      enviado_por: user.id,
    })
    .select("id");

  if (errorInsert) {
    if (errorInsert.code === "23505") {
      return { ok: false, error: "Ya se le mandó este mail." };
    }
    console.error("[CICLO NEGOCIOS] insert", errorInsert);
    return { ok: false, error: "No se pudo registrar el envío." };
  }

  const envioId = filas?.[0]?.id as string | undefined;
  if (!envioId) return { ok: false, error: "No tenés permiso para mandar mails." };

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
    const { error: errorRollback } = await supabase
      .from("envios_email")
      .delete()
      .eq("id", envioId);

    if (errorRollback) {
      console.error("[CICLO NEGOCIOS] rollback", { envioId, errorRollback });
    }
    return { ok: false, error: envio.error };
  }

  if (envio.proveedorId) {
    // `.select()` porque un UPDATE filtrado por RLS vuelve con 0 filas y
    // `error: null`: sin esto, "no se guardó el id" se ve igual que "se
    // guardó", y ese id es lo que se busca en Resend cuando alguien dice que
    // no le llegó.
    const { data: actualizadas, error: errorId } = await supabase
      .from("envios_email")
      .update({ proveedor_id: envio.proveedorId })
      .eq("id", envioId)
      .select("id");

    if (errorId || !actualizadas || actualizadas.length === 0) {
      console.error("[CICLO NEGOCIOS] proveedor_id", { envioId, errorId });
    }
  }

  revalidatePath("/admincomerz");
  return { ok: true, proveedorId: envio.proveedorId };
}

/**
 * El mail de un comercio, sin mandarlo. Para la preview del panel.
 *
 * `envioId` de mentira: no hay envío todavía, así que el link de baja de la
 * preview no da de baja nada.
 */
export async function previsualizarMailDeNegocioAction(
  negocioId: string,
  clave: ClaveCampanaNegocio,
): Promise<MailRenderizado | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("ciclo_de_vida_negocios");
  if (error) return null;

  const negocio = (data ?? [])
    .map(mapear)
    .find((n: NegocioEnCiclo) => n.negocioId === negocioId);
  if (!negocio) return null;

  const campana = construirCampanaNegocio(clave, negocio, {
    linkDePago: LINK_DE_PAGO,
    alias: ALIAS_MP,
  });
  if (!campana) return null;

  return renderizarCampana(campana, {
    urlBase: await urlBaseDeLaRequest(),
    envioId: "00000000-0000-0000-0000-000000000000",
  });
}
