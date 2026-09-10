"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { enviarMail } from "@/shared/lib/enviar-mail";
import { urlBaseDeLaRequest } from "@/shared/lib/url-base-request";
import {
  campanaDeEtapa,
  renderizarCampana,
  type Campana,
} from "@/features/admin/lib/campanas-email";
import {
  construirCampanaNegocio,
  type ClaveCampanaNegocio,
  type NegocioEnCiclo,
} from "@/features/admin/lib/campanas-negocio";
import { ETAPAS, type EtapaAlta } from "@/features/admin/lib/embudo-alta";

/**
 * Mandarse cualquiera de los mails a una casilla propia, para verlo de verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ALCANZA CON LA PREVIEW
 *
 * La preview del panel muestra el HTML en un iframe, que es un navegador. Lo
 * que rompe un mail no es el navegador: es Gmail borrando el `<style>` del
 * head, Outlook ignorando el `border-radius`, el cliente de Android cortando
 * la tabla, y el filtro de spam. Nada de eso se ve sin mandarlo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE PUEDE PROBAR MANDÁNDOSELO A UN CLIENTE
 *
 * Porque el guard de `envios_email` es por (usuario, campaña): probar el mail
 * de fin de prueba usando a un comercio real quema el envío de verdad de ese
 * comercio. Por eso esta acción usa DATOS DE EJEMPLO y registra la fila con
 * `forzado = true` y la clave prefijada `prueba:` — no ocupa el lugar de
 * ningún envío real y no puede bloquear ninguno.
 *
 * La dirección es libre: puede ser una casilla de Gmail, una de Outlook y una
 * de Hotmail, que es exactamente la prueba que hay que hacer.
 */

/**
 * Un comercio inventado, con números que se parecen a los reales.
 *
 * De ejemplo a propósito: con un comercio real, el mail de prueba diría los
 * datos de un cliente y la persona que recibe la prueba estaría leyendo las
 * ventas de otro.
 */
const NEGOCIO_DE_EJEMPLO: NegocioEnCiclo = {
  negocioId: "00000000-0000-0000-0000-000000000000",
  nombre: "Tienda de Ejemplo",
  estado: "prueba",
  creado: "2026-08-27T10:00:00Z",
  planVencimiento: null, // se completa según la campaña que se prueba
  planNombre: "Gestión",
  planPrecio: 50000,
  planLink: null,
  duenioId: null,
  duenioEmail: null,
  productos: 47,
  ventas: 12,
  ultimaVenta: null,
  pagos: 0,
};

const DIA = 86_400_000;

/**
 * Cada campaña necesita una situación distinta para tener sentido: el fin de
 * prueba pide un vencimiento a tres días, el recordatorio uno pasado, la
 * inactividad una última venta vieja. Sin esto, el mail de prueba saldría con
 * "te quedan NaN días".
 */
function negocioParaProbar(
  clave: ClaveCampanaNegocio,
  ahora: Date,
): NegocioEnCiclo {
  const enDias = (d: number) =>
    new Date(ahora.getTime() + d * DIA).toISOString();

  switch (clave) {
    case "fin_de_prueba":
      return { ...NEGOCIO_DE_EJEMPLO, planVencimiento: enDias(3) };
    case "fin_de_prueba_sin_uso":
      return {
        ...NEGOCIO_DE_EJEMPLO,
        planVencimiento: enDias(3),
        productos: 0,
        ventas: 0,
      };
    case "prueba_vencida":
      return { ...NEGOCIO_DE_EJEMPLO, planVencimiento: enDias(-4) };
    // Las de cobro llevan link de plan puesto para que la prueba muestre el
    // texto de ADHESIÓN, que es el que va a salir de verdad. Con el link de
    // respaldo se vería el otro texto ("pagá ahora") y la prueba estaría
    // mostrando un mail que nadie va a recibir.
    case "aviso_cobro":
      return {
        ...NEGOCIO_DE_EJEMPLO,
        estado: "activo",
        planVencimiento: enDias(2),
        planLink: LINK_DE_PAGO ?? LINK_DE_MENTIRA,
        pagos: 1,
      };
    case "recordatorio_cobro":
      return {
        ...NEGOCIO_DE_EJEMPLO,
        estado: "activo",
        planVencimiento: enDias(-6),
        planLink: LINK_DE_PAGO ?? LINK_DE_MENTIRA,
        pagos: 1,
      };
    case "inactividad":
      return {
        ...NEGOCIO_DE_EJEMPLO,
        estado: "activo",
        planVencimiento: enDias(20),
        ultimaVenta: enDias(-12),
        pagos: 1,
      };
  }
}

const LINK_DE_PAGO = process.env.MERCADOPAGO_LINK_PAGO?.trim() || null;
const ALIAS_MP = process.env.MERCADOPAGO_ALIAS?.trim() || null;

/**
 * El link que se usa en la PRUEBA de las campañas de cobro cuando todavía no
 * hay uno configurado. Es de mentira y no lleva a ningún lado: sirve para ver
 * cómo queda el botón, no para cobrar. El envío real sigue frenado sin
 * `MERCADOPAGO_LINK_PAGO`.
 */
const LINK_DE_MENTIRA = "https://www.mercadopago.com.ar/";

export type ClaveDeMail = EtapaAlta | ClaveCampanaNegocio;

export interface OpcionDeMail {
  clave: ClaveDeMail;
  etiqueta: string;
  tipo: "alta" | "negocio";
}

export interface ResultadoPrueba {
  ok: boolean;
  error?: string;
  /** Avisos que no impiden mandar, como el link de pago de mentira. */
  aviso?: string;
}

function campanaDeClave(
  clave: ClaveDeMail,
  ahora: Date,
): { campana: Campana | null; usoLinkFalso: boolean } {
  if ((ETAPAS as readonly string[]).includes(clave)) {
    return { campana: campanaDeEtapa(clave as EtapaAlta), usoLinkFalso: false };
  }

  const claveNegocio = clave as ClaveCampanaNegocio;
  const esDeCobro =
    claveNegocio === "aviso_cobro" || claveNegocio === "recordatorio_cobro";

  return {
    campana: construirCampanaNegocio(
      claveNegocio,
      negocioParaProbar(claveNegocio, ahora),
      { ahora, linkDePago: LINK_DE_PAGO, alias: ALIAS_MP },
    ),
    usoLinkFalso: esDeCobro && LINK_DE_PAGO === null,
  };
}

/**
 * Manda UNA campaña con datos de ejemplo a la dirección que se le pase.
 *
 * El registro va con `forzado = true` y la clave prefijada `prueba:`, así que
 * nunca ocupa el lugar de un envío real ni bloquea uno. Se registra igual —y
 * no se saltea la tabla— porque un mail que salió tiene que quedar anotado,
 * aunque sea una prueba: es lo que explica un envío que aparece en el panel de
 * Resend.
 */
export async function enviarMailDePruebaAction(
  clave: ClaveDeMail,
  destino: string,
): Promise<ResultadoPrueba> {
  const destinatario = destino?.trim().toLowerCase();
  if (!destinatario || !destinatario.includes("@")) {
    return { ok: false, error: "Poné una dirección válida." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión vencida." };

  const ahora = new Date();
  const { campana, usoLinkFalso } = campanaDeClave(clave, ahora);
  if (!campana) return { ok: false, error: "Esa campaña no existe." };

  const { data: filas, error: errorInsert } = await supabase
    .from("envios_email")
    .insert({
      usuario_id: user.id,
      email: destinatario,
      campana: `prueba:${clave}`,
      etapa: "PRUEBA",
      forzado: true,
      enviado_por: user.id,
    })
    .select("id");

  if (errorInsert) {
    console.error("[MAIL PRUEBA] insert", errorInsert);
    return { ok: false, error: "No se pudo registrar el envío." };
  }

  const envioId = filas?.[0]?.id as string | undefined;
  if (!envioId) return { ok: false, error: "No tenés permiso para mandar mails." };

  const cuerpo = renderizarCampana(campana, {
    urlBase: await urlBaseDeLaRequest(),
    envioId,
  });

  const envio = await enviarMail({
    // El asunto lleva la marca de prueba para que no se confunda con uno real
    // en la bandeja propia, y para que no se reenvíe por error a un cliente.
    para: destinatario,
    asunto: `[PRUEBA] ${cuerpo.asunto}`,
    html: cuerpo.html,
    texto: cuerpo.texto,
  });

  if (!envio.ok) {
    await supabase.from("envios_email").delete().eq("id", envioId);
    return { ok: false, error: envio.error };
  }

  return {
    ok: true,
    aviso: usoLinkFalso
      ? "El botón de pago apunta a un link de mentira: falta MERCADOPAGO_LINK_PAGO."
      : undefined,
  };
}
