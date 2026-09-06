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
   * YA NO ES LA BASE DEL RECARGO — se sigue pidiendo y devolviendo porque es
   * información útil (la antigüedad, el Advisor), pero desde el 5/9/2026 el
   * recargo se calcula sobre el SALDO COMPLETO. Ver el comentario de
   * `calcularSaldoConRecargo`.
   */
  monto_vencido?: number | string | null;
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
 *
 * LA BASE ES EL SALDO COMPLETO, y esto cambió el 5/9/2026. Entre el 30/8 y esa
 * fecha la base fue la porción vencida FIFO, para no cobrarle mora a una
 * clienta por lo que había comprado ayer. La dueña pidió lo contrario y es una
 * decisión comercial, no un error de cálculo: si se atrasó, toda su cuenta
 * entra en mora. Su ejemplo, textual: una deuda de $30.000 que entra en mora
 * pasa a $36.000, y lo que pague después se descuenta de $36.000 — no del
 * recargo por un lado y el capital por el otro.
 *
 * Lo que esa decisión cuesta, medido el día que se tomó: en Evens una clienta
 * con $175 vencidos y $104.825 de saldo pasa de $26,25 de mora a $15.723,75.
 * Está aceptado a sabiendas; si algún día se quiere volver atrás, la base es
 * `montoVencido`, que se sigue calculando y devolviendo.
 *
 * SIGUE SIENDO ÚNICO, no compuesto: se calcula siempre sobre
 * `monto_pendiente`, que es capital, así que recalcularlo dos veces da lo
 * mismo. La pantalla de Configuración > Clientes lo promete con todas las
 * letras ("se suma una única vez ... no se acumula día a día").
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
  // Vencido = hay saldo y la fecha pasó. NO se exige `montoVencido > 0`: con
  // el vencimiento anclado al ciclo de deuda (ver `recalcular_vencimiento_cc`),
  // una clienta puede estar en mora con la imputación FIFO diciendo cero, y
  // tiene que cobrar recargo igual. Eran 5 clientas el 5/9/2026.
  const estaVencido = saldoBase > 0 && diasVencido !== null && diasVencido > 0;

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
    // Sobre el SALDO COMPLETO. Es una cláusula de aceleración: si la clienta se
    // atrasó, toda su cuenta entra en mora, no solo el tramo con fecha pasada.
    montoRecargo = (saldoBase * pct) / 100;
  }

  return {
    saldoBase,
    montoVencido,
    montoRecargo,
    saldoConRecargo: saldoBase + montoRecargo,
    estaVencido: true,
  };
}
