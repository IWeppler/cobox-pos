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
  /**
   * Cuánto del saldo son RECARGOS ANTERIORES y no mercadería. Sale de
   * `mora_viva` en `deuda_cc_vencida`.
   *
   * La base del recargo es el capital: `monto_pendiente - mora_previa`. Sin
   * esto, el segundo recargo de una clienta se calcularía sobre un saldo que
   * ya contiene el primero — interés compuesto, contra lo que promete la
   * pantalla de Configuración > Clientes ("se suma una única vez ... no se
   * acumula día a día").
   *
   * El default 0 no es "no se sabe", es un HECHO para casi toda la base: el
   * 9/9/2026 las 39 filas de mora del SaaS son primeros recargos, así que
   * ninguna clienta tiene mora previa. Omitirlo dice "esta cuenta no tiene
   * recargos sin pagar", que es la verdad en el caso normal.
   */
  mora_previa?: number | string | null;
}

export interface SaldoConRecargo {
  saldoBase: number;
  /** La porción vencida por FIFO. Se informa; NO es la base del recargo desde
   * el 5/9/2026. */
  montoVencido: number;
  /** Sobre qué se calculó el recargo: el capital adeudado, sin los recargos
   * anteriores. Se devuelve para poder mostrarlo y para que un test pueda
   * afirmar que la mora no entró en su propia base. */
  baseRecargo: number;
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
 * SIGUE SIENDO ÚNICO, no compuesto, y desde el 9/9/2026 eso hay que sostenerlo
 * a mano. Antes lo cumplía la aritmética sola: `monto_pendiente` era capital.
 * Dejó de serlo cuando el recargo pasó a materializarse como un DEBITO propio
 * —un débito entra al saldo—, así que un segundo recargo se calcularía sobre
 * un saldo que ya contiene el primero. Por eso existe `mora_previa`: la base
 * es `monto_pendiente - mora_previa`, o sea capital. La pantalla de
 * Configuración > Clientes lo promete con todas las letras ("se suma una única
 * vez ... no se acumula día a día") y esto es lo que lo hace verdad.
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
  // La base del recargo: capital, sin los recargos que ya se cobraron y siguen
  // impagos. Acotada al saldo por si el libro viniera descuadrado — misma
  // defensa que `montoVencido`.
  const moraPrevia = Math.min(
    saldoBase,
    Math.max(0, Number(ticket.mora_previa) || 0),
  );
  const baseRecargo = Math.max(0, saldoBase - moraPrevia);
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
      baseRecargo,
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
    // Sobre todo el CAPITAL. Es una cláusula de aceleración: si la clienta se
    // atrasó, toda su cuenta entra en mora, no solo el tramo con fecha pasada.
    // Pero capital: un recargo anterior impago no puede generar recargo (ver
    // `mora_previa`).
    montoRecargo = (baseRecargo * pct) / 100;
  }

  return {
    saldoBase,
    montoVencido,
    baseRecargo,
    montoRecargo,
    saldoConRecargo: saldoBase + montoRecargo,
    estaVencido: true,
  };
}
