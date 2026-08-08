import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUNTO_VENTA_INTERNO_DEFAULT,
  parsePuntoVenta,
  type TipoComprobante,
} from "@/shared/lib/facturacion";
import {
  determinarComprobante,
  type NotaCredito,
  type TipoOperacion,
} from "@/shared/lib/determinar-comprobante";

export interface ConfigComprobante {
  modo_facturacion?: unknown;
  comprobante_defecto?: unknown;
  /** Condición de IVA del EMISOR (el comercio). */
  condicion_iva?: string | null;
  punto_venta?: number | null;
}

export interface DatosReceptor {
  cliente_id: string | null;
  receptor_razon_social: string | null;
  receptor_cuit: string | null;
  receptor_condicion_iva: string | null;
}

export interface EmitirComprobanteInput {
  ventaId: string;
  config: ConfigComprobante | null;
  receptor: DatosReceptor | null;
  /** Lo que efectivamente paga el cliente, recargos incluidos. Es el mismo
   * número que `ventas.total`: si difirieran, el comprobante diría una cosa y
   * el ticket otra. */
  total: number;
  emitidoPor: string;
  /** VENTA por defecto. DEVOLUCION emite la nota de crédito de la letra que
   * corresponda (hoy inalcanzable: requiere ARCA). */
  operacion?: TipoOperacion;
}

export interface ResultadoComprobante {
  ok: boolean;
  tipo: TipoComprobante | NotaCredito;
  numero: number | null;
  puntoVenta: number;
  /** Por qué se determinó ese comprobante. Para logs y para poder responder
   * "¿por qué esta venta salió B y no A?" sin reconstruirlo de memoria. */
  motivo: string;
}

/**
 * Registra el comprobante de una venta ya creada.
 *
 * POR QUÉ NO ABORTA LA VENTA SI FALLA
 *
 * Cuando esto corre, la venta ya está grabada, el stock descontado y la plata
 * cobrada. No hay transacción que abarque las dos cosas (create-sale.ts
 * escribe en pasos sueltos), así que un fallo acá deja dos opciones: revertir
 * una venta que ya ocurrió en el mostrador, o dejarla sin comprobante. Con
 * TICKET interno la segunda es claramente menos mala — el número de ticket no
 * cambia lo que pasó, y hacer rebotar una venta cobrada por eso sería el
 * incidente, no la protección.
 *
 * Por eso devuelve un resultado y NUNCA lanza. Falla ruidosamente en los logs
 * (`[COMPROBANTE]` como error) porque una venta sin comprobante es un hueco en
 * la contabilidad y tiene que poder encontrarse después.
 *
 * El día que ARCA emita de verdad, ESTA decisión hay que revisarla: una
 * factura no se puede entregar sin CAE, y ahí el orden correcto es pedir el
 * CAE ANTES de cerrar la venta, no después.
 */
export async function emitirComprobante(
  supabase: SupabaseClient,
  input: EmitirComprobanteInput,
): Promise<ResultadoComprobante> {
  // QUIÉN decide el comprobante: acá, en el server, cruzando emisor + receptor
  // + operación + configuración. El POS manda la venta, no el tipo de
  // comprobante — un comprobante elegido en el navegador es un comprobante que
  // se puede elegir con las DevTools abiertas.
  const { tipo, motivo } = determinarComprobante({
    modoFacturacion: input.config?.modo_facturacion,
    condicionIvaEmisor: input.config?.condicion_iva,
    condicionIvaReceptor: input.receptor?.receptor_condicion_iva,
    comprobanteDefecto: input.config?.comprobante_defecto,
    operacion: input.operacion,
  });

  // El punto de venta configurado manda; si no hay ninguno (los 4 negocios
  // hoy), el ticket interno se numera en la serie 1. parsePuntoVenta protege
  // de un valor inválido que se haya colado por fuera del panel.
  const puntoVenta =
    parsePuntoVenta(input.config?.punto_venta) ?? PUNTO_VENTA_INTERNO_DEFAULT;

  const fallo = (etapa: string, error: unknown): ResultadoComprobante => {
    console.error("[COMPROBANTE] No se pudo emitir", {
      etapa,
      ventaId: input.ventaId,
      tipo,
      puntoVenta,
      error,
    });
    return { ok: false, tipo, numero: null, puntoVenta, motivo };
  };

  // El número sale de la RPC, que lo serializa con un row lock. Nunca de un
  // max(numero) + 1: dos cajas vendiendo a la vez leerían el mismo.
  const { data: numero, error: errorNumero } = await supabase.rpc(
    "siguiente_numero_comprobante",
    { p_punto_venta: puntoVenta, p_tipo: tipo },
  );

  if (errorNumero || numero == null) {
    return fallo("numeracion", errorNumero);
  }

  const { error: errorInsert } = await supabase.from("comprobantes").insert({
    venta_id: input.ventaId,
    tipo,
    punto_venta: puntoVenta,
    numero,
    cliente_id: input.receptor?.cliente_id ?? null,
    receptor_razon_social: input.receptor?.receptor_razon_social ?? null,
    receptor_cuit: input.receptor?.receptor_cuit ?? null,
    receptor_condicion_iva: input.receptor?.receptor_condicion_iva ?? null,
    // neto e iva quedan en 0: solo la Factura A discrimina IVA. En un ticket
    // interno (y en B y C) el total ya viene con el impuesto adentro, y
    // partirlo acá sería inventar un desglose que el papel no dice.
    neto: 0,
    iva_monto: 0,
    total: input.total,
    emitido_por: input.emitidoPor,
  });

  if (errorInsert) {
    // El número ya se consumió y no se devuelve a propósito: "descontar" el
    // contador es justo la carrera que la RPC evita, y un hueco en la
    // numeración interna es inofensivo comparado con dos comprobantes con el
    // mismo número.
    return fallo("insert", errorInsert);
  }

  return { ok: true, tipo, numero: Number(numero), puntoVenta, motivo };
}
