import { RecargoMoraTipo } from "@/entities/config/types";
import { calcularDiasVencido } from "./calcular-dias-vencido";

export interface RecargoMoraConfig {
  recargo_mora_tipo: RecargoMoraTipo;
  recargo_mora_valor: number;
}

export interface TicketConVencimiento {
  monto_pendiente?: number | string | null;
  fecha_vencimiento?: string | null;
}

export interface SaldoConRecargo {
  saldoBase: number;
  montoRecargo: number;
  saldoConRecargo: number;
  estaVencido: boolean;
}

/**
 * Recargo único (no compuesto): siempre parte de monto_pendiente +
 * fecha_vencimiento del ticket (datos base estables), nunca de un saldo
 * que ya tenga el recargo sumado — da el mismo resultado sin importar
 * cuántas veces se recalcule.
 */
export function calcularSaldoConRecargo(
  ticket: TicketConVencimiento,
  config: RecargoMoraConfig,
): SaldoConRecargo {
  const saldoBase = Math.max(0, Number(ticket.monto_pendiente) || 0);
  const diasVencido = calcularDiasVencido(ticket.fecha_vencimiento);
  const estaVencido = saldoBase > 0 && diasVencido !== null && diasVencido > 0;

  if (!estaVencido) {
    return {
      saldoBase,
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
    montoRecargo = (saldoBase * pct) / 100;
  }

  return {
    saldoBase,
    montoRecargo,
    saldoConRecargo: saldoBase + montoRecargo,
    estaVencido: true,
  };
}

export function calcularRecargoMoraTotal(
  tickets: TicketConVencimiento[],
  config: RecargoMoraConfig,
) {
  let totalBase = 0;
  let totalRecargo = 0;

  for (const ticket of tickets) {
    const resultado = calcularSaldoConRecargo(ticket, config);
    totalBase += resultado.saldoBase;
    totalRecargo += resultado.montoRecargo;
  }

  return {
    totalBase,
    totalRecargo,
    totalConRecargo: totalBase + totalRecargo,
  };
}
