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
      {
        monto_pendiente: 100000,
        fecha_vencimiento: haceDias(10),
        monto_vencido: 100000,
      },
      PORCENTAJE,
    );
    expect(r.estaVencido).toBe(true);
    expect(r.montoRecargo).toBe(15000);
    expect(r.saldoConRecargo).toBe(115000);
  });

  it("el monto fijo no depende del saldo", () => {
    const chico = calcularSaldoConRecargo(
      {
        monto_pendiente: 8000,
        fecha_vencimiento: haceDias(1),
        monto_vencido: 8000,
      },
      FIJO,
    );
    const grande = calcularSaldoConRecargo(
      {
        monto_pendiente: 900000,
        fecha_vencimiento: haceDias(1),
        monto_vencido: 900000,
      },
      FIJO,
    );
    expect(chico.montoRecargo).toBe(5000);
    expect(grande.montoRecargo).toBe(5000);
  });

  it("no cobra recargo antes del vencimiento", () => {
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: 100000,
        fecha_vencimiento: haceDias(-5),
        monto_vencido: 0,
      },
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
      { monto_pendiente: 100000, fecha_vencimiento: null, monto_vencido: 0 },
      PORCENTAJE,
    );
    expect(r.montoRecargo).toBe(0);
  });

  it("con la mora en NINGUNO no suma nada aunque esté vencido", () => {
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: 100000,
        fecha_vencimiento: haceDias(90),
        monto_vencido: 100000,
      },
      NINGUNO,
    );
    expect(r.estaVencido).toBe(true);
    expect(r.montoRecargo).toBe(0);
  });

  it("saldo cero no genera recargo", () => {
    const r = calcularSaldoConRecargo(
      { monto_pendiente: 0, fecha_vencimiento: haceDias(30), monto_vencido: 0 },
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
      {
        monto_pendiente: 100000,
        fecha_vencimiento: haceDias(10),
        monto_vencido: 100000,
      },
      PORCENTAJE,
    );
    const segunda = calcularSaldoConRecargo(
      {
        monto_pendiente: 100000,
        fecha_vencimiento: haceDias(10),
        monto_vencido: 100000,
      },
      PORCENTAJE,
    );
    expect(segunda.saldoConRecargo).toBe(primera.saldoConRecargo);
  });

  it("un saldo negativo (cliente a favor) no genera recargo", () => {
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: -3000,
        fecha_vencimiento: haceDias(10),
        monto_vencido: 0,
      },
      PORCENTAJE,
    );
    expect(r.saldoBase).toBe(0);
    expect(r.montoRecargo).toBe(0);
  });

  it("cobra la mora SOLO sobre la parte vencida, no sobre el saldo", () => {
    // El caso real que lo motivó (Evens, 30/8/2026): CELESTE SCHOFER debía
    // $104.825 con $175 vencidos —el resto de un ticket del 21/7— y el resto
    // comprado el 11/8 y el 29/8, que vencían en septiembre y octubre. Sobre
    // el saldo entero le tocaban $15.723,75 de mora.
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: 104825,
        fecha_vencimiento: haceDias(5),
        monto_vencido: 175,
      },
      PORCENTAJE,
    );
    expect(r.estaVencido).toBe(true);
    expect(r.montoRecargo).toBe(26.25);
    expect(r.saldoConRecargo).toBe(104851.25);
  });

  it("con todo el saldo vencido cobra lo mismo que antes", () => {
    // La contracara: para quien está atrasado con todo —11 de los 19 cobros
    // de mora ya hechos— el número no cambia en un peso.
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: 150200,
        fecha_vencimiento: haceDias(22),
        monto_vencido: 150200,
      },
      PORCENTAJE,
    );
    expect(r.montoRecargo).toBe(22530);
  });

  it("sin nada vencido no hay mora aunque la fecha haya pasado", () => {
    // Pasa cuando un pago canceló FIFO lo viejo y el caché del cliente todavía
    // arrastra la fecha: 5 de los 19 cobros de mora reales fueron así.
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: 60050,
        fecha_vencimiento: haceDias(3),
        monto_vencido: 0,
      },
      PORCENTAJE,
    );
    expect(r.estaVencido).toBe(false);
    expect(r.montoRecargo).toBe(0);
  });

  it("el vencido nunca puede superar al saldo", () => {
    // Defensa contra un libro descuadrado: si `deuda_cc_vencida` devolviera
    // más de lo que dice `saldo_pendiente`, la mora se calcularía sobre plata
    // que el cliente no debe.
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: 10000,
        fecha_vencimiento: haceDias(10),
        monto_vencido: 999999,
      },
      PORCENTAJE,
    );
    expect(r.montoVencido).toBe(10000);
    expect(r.montoRecargo).toBe(1500);
  });

  it("un vencido ausente no cobra mora", () => {
    // Fail-closed: TypeScript obliga a pasar el campo, pero si llega null o
    // undefined desde la base la respuesta es no cobrar, no cobrar sobre todo.
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: 100000,
        fecha_vencimiento: haceDias(10),
        monto_vencido: null,
      },
      PORCENTAJE,
    );
    expect(r.montoRecargo).toBe(0);
  });

  it("acepta el saldo como string, que es como lo devuelve numeric de Postgres", () => {
    const r = calcularSaldoConRecargo(
      {
        monto_pendiente: "100000.00",
        fecha_vencimiento: haceDias(10),
        monto_vencido: "100000.00",
      },
      PORCENTAJE,
    );
    expect(r.montoRecargo).toBe(15000);
  });
});
