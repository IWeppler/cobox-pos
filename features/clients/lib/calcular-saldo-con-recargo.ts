import { RecargoMoraTipo } from "@/entities/config/types";
import { calcularDiasVencido } from "./calcular-dias-vencido";

export interface RecargoMoraConfig {
  recargo_mora_tipo: RecargoMoraTipo;
  recargo_mora_valor: number;
}

export interface TicketConVencimiento {
  monto_pendiente?: number | string | null;
  fecha_vencimiento?: string | null;
  /**
   * La porción del saldo que YA venció, imputando los pagos FIFO. Sale de
   * `deuda_cc_vencida` en la base.
   *
   * Es OBLIGATORIO y sin default a propósito. Hasta el 30/8/2026 el recargo se
   * calculaba sobre `monto_pendiente` entero, así que un solo ticket atrasado
   * arrastraba a todo lo comprado después: en Evens, una clienta con $175
   * vencidos y $104.825 de saldo iba a pagar $15.723,75 de mora, casi toda por
   * una compra del día anterior que vencía recién en octubre. Sobre lo ya
   * cobrado eran $37.590 de más en 19 cobros, con 5 donde no había NADA
   * vencido.
   *
   * Un default acá volvería a ese comportamiento en el primer llamador que se
   * olvide de pasarlo. Que sea obligatorio hace que el olvido sea un error de
   * compilación y no plata de más cobrada a una clienta.
   */
  monto_vencido: number | string | null | undefined;
}

export interface SaldoConRecargo {
  saldoBase: number;
  /** Lo que se usó como base del recargo, ya acotado al saldo. */
  montoVencido: number;
  montoRecargo: number;
  saldoConRecargo: number;
  estaVencido: boolean;
}

/**
 * Recargo único (no compuesto): siempre parte de monto_pendiente +
 * fecha_vencimiento del ticket (datos base estables), nunca de un saldo
 * que ya tenga el recargo sumado — da el mismo resultado sin importar
 * cuántas veces se recalcule.
 *
 * La ÚNICA puerta del recargo por mora, y se le pasa siempre el saldo del
 * cliente (`saldo_pendiente` + `fecha_vencimiento_deuda`), no una venta: la
 * deuda también entra por CSV y por ajuste manual, y esas no dejan fila en
 * `ventas`. La firma quedó genérica a propósito —monto pendiente + fecha— para
 * que el server (registrarPagoDeudaAction) y la UI (tabla y detalle del
 * cliente) calculen exactamente el mismo número.
 */
export function calcularSaldoConRecargo(
  ticket: TicketConVencimiento,
  config: RecargoMoraConfig,
): SaldoConRecargo {
  const saldoBase = Math.max(0, Number(ticket.monto_pendiente) || 0);
  const montoVencido = Math.min(
    saldoBase,
    Math.max(0, Number(ticket.monto_vencido) || 0),
  );
  const diasVencido = calcularDiasVencido(ticket.fecha_vencimiento);
  const estaVencido =
    montoVencido > 0 && diasVencido !== null && diasVencido > 0;

  if (!estaVencido) {
    return {
      saldoBase,
      montoVencido,
      montoRecargo: 0,
      saldoConRecargo: saldoBase,
      estaVencido: false,
    };
  }

  let montoRecargo = 0;
  if (config.recargo_mora_tipo === "MONTO_FIJO") {
    montoRecargo = Math.max(0, Number(config.recargo_mora_valor) || 0);
  } else if (config.recargo_mora_tipo === "PORCENTAJE") {
    const pct = Math.max(0, Number(config.recargo_mora_valor) || 0);
    // Sobre lo VENCIDO, no sobre el saldo: ver el comentario de la interfaz.
    montoRecargo = (montoVencido * pct) / 100;
  }

  return {
    saldoBase,
    montoVencido,
    montoRecargo,
    saldoConRecargo: saldoBase + montoRecargo,
    estaVencido: true,
  };
}
