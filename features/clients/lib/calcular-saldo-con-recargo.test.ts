import { describe, expect, it } from "vitest";
import {
  calcularSaldoConRecargo,
  type RecargoMoraConfig,
} from "./calcular-saldo-con-recargo";

const PORCENTAJE: RecargoMoraConfig = {
  recargo_mora_tipo: "PORCENTAJE",
  recargo_mora_valor: 15,
};
const FIJO: RecargoMoraConfig = {
  recargo_mora_tipo: "MONTO_FIJO",
  recargo_mora_valor: 5000,
};
const NINGUNO: RecargoMoraConfig = {
  recargo_mora_tipo: "NINGUNO",
  recargo_mora_valor: 0,
};

/**
 * Fechas relativas a hoy, en ISO — es lo que guarda fecha_vencimiento_deuda.
 *
 * La fecha se arma con los componentes LOCALES, no con `toISOString()`.
 * `calcularDiasVencido` compara contra el calendario local
 * (`hoy.getFullYear/getMonth/getDate`), así que el helper tiene que hablar el
 * mismo idioma: con `toISOString()`, en Argentina (UTC−3) a partir de las
 * 21:00 el instante ya cayó en el día siguiente en UTC y `haceDias(1)`
 * devolvía HOY. El test daba 0 de recargo y fallaba — todas las noches, y solo
 * de noche.
 */
function haceDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  const mes = String(f.getMonth() + 1).padStart(2, "0");
  const dia = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${mes}-${dia}`;
}

describe("calcularSaldoConRecargo", () => {
  it("aplica el porcentaje sobre el saldo vencido", () => {
    const r = calcularSaldoConRecargo(
      { monto_pendiente: 100000, fecha_vencimiento: haceDias(10) },
      PORCENTAJE,
    );
    expect(r.estaVencido).toBe(true);
    expect(r.montoRecargo).toBe(15000);
    expect(r.saldoConRecargo).toBe(115000);
  });

  it("el monto fijo no depende del saldo", () => {
    const chico = calcularSaldoConRecargo(
      { monto_pendiente: 8000, fecha_vencimiento: haceDias(1) },
      FIJO,
    );
    const grande = calcularSaldoConRecargo(
      { monto_pendiente: 900000, fecha_vencimiento: haceDias(1) },
      FIJO,
    );
    expect(chico.montoRecargo).toBe(5000);
    expect(grande.montoRecargo).toBe(5000);
  });

  it("no cobra recargo antes del vencimiento", () => {
    const r = calcularSaldoConRecargo(
      { monto_pendiente: 100000, fecha_vencimiento: haceDias(-5) },
      PORCENTAJE,
    );
    expect(r.estaVencido).toBe(false);
    expect(r.montoRecargo).toBe(0);
    expect(r.saldoConRecargo).toBe(100000);
  });

  it("sin fecha de vencimiento no hay mora", () => {
    // El caso de la deuda importada por CSV sin columna de vencimiento: se
    // debe la plata, pero no hay desde cuándo contar el atraso.
    const r = calcularSaldoConRecargo(
      { monto_pendiente: 100000, fecha_vencimiento: null },
      PORCENTAJE,
    );
    expect(r.montoRecargo).toBe(0);
  });

  it("con la mora en NINGUNO no suma nada aunque esté vencido", () => {
    const r = calcularSaldoConRecargo(
      { monto_pendiente: 100000, fecha_vencimiento: haceDias(90) },
      NINGUNO,
    );
    expect(r.estaVencido).toBe(true);
    expect(r.montoRecargo).toBe(0);
  });

  it("saldo cero no genera recargo", () => {
    const r = calcularSaldoConRecargo(
      { monto_pendiente: 0, fecha_vencimiento: haceDias(30) },
      FIJO,
    );
    expect(r.estaVencido).toBe(false);
    expect(r.montoRecargo).toBe(0);
  });

  it("es idempotente: recalcular sobre el resultado da lo mismo", () => {
    // La razón de que reciba el saldo BASE y no uno que ya tenga recargo: la
    // mora es única, no compuesta. Si el saldo con recargo se reinyectara,
    // cada refresh de la pantalla la haría crecer sola.
    const primera = calcularSaldoConRecargo(
      { monto_pendiente: 100000, fecha_vencimiento: haceDias(10) },
      PORCENTAJE,
    );
    const segunda = calcularSaldoConRecargo(
      { monto_pendiente: 100000, fecha_vencimiento: haceDias(10) },
      PORCENTAJE,
    );
    expect(segunda.saldoConRecargo).toBe(primera.saldoConRecargo);
  });

  it("un saldo negativo (cliente a favor) no genera recargo", () => {
    const r = calcularSaldoConRecargo(
      { monto_pendiente: -3000, fecha_vencimiento: haceDias(10) },
      PORCENTAJE,
    );
    expect(r.saldoBase).toBe(0);
    expect(r.montoRecargo).toBe(0);
  });

  it("acepta el saldo como string, que es como lo devuelve numeric de Postgres", () => {
    const r = calcularSaldoConRecargo(
      { monto_pendiente: "100000.00", fecha_vencimiento: haceDias(10) },
      PORCENTAJE,
    );
    expect(r.montoRecargo).toBe(15000);
  });
});
