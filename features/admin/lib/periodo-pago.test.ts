import { describe, expect, it } from "vitest";
import { calcularPeriodoPago, sumarMeses } from "./periodo-pago";

describe("sumarMeses", () => {
  it("suma un mes normal", () => {
    expect(sumarMeses("2026-08-23", 1)).toBe("2026-09-23");
  });

  it("suma seis meses cruzando el año", () => {
    expect(sumarMeses("2026-10-05", 6)).toBe("2027-04-05");
  });

  it("no se corre de mes cuando el destino es más corto", () => {
    // `new Date().setMonth(+1)` sobre el 31 de enero da 3 de marzo, porque
    // febrero no tiene 31. Acá se topea al último día real.
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("respeta los años bisiestos", () => {
    expect(sumarMeses("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("calcularPeriodoPago", () => {
  it("con la suscripción viva, el período nuevo empieza donde termina la anterior", () => {
    // Paga el 20 y le vencía el 30: tiene que quedar cubierto hasta el 30 del
    // mes siguiente. Contar desde hoy le comería los 10 días que le faltaban.
    const p = calcularPeriodoPago({
      hoy: "2026-08-20",
      vencimientoActual: "2026-08-30",
      modalidad: "mensual",
    });

    expect(p).toEqual({ desde: "2026-08-30", hasta: "2026-09-30" });
  });

  it("con la suscripción vencida, arranca hoy", () => {
    // Los días que estuvo sin pagar no se cubren retroactivamente.
    const p = calcularPeriodoPago({
      hoy: "2026-08-23",
      vencimientoActual: "2026-07-15",
      modalidad: "mensual",
    });

    expect(p).toEqual({ desde: "2026-08-23", hasta: "2026-09-23" });
  });

  it("sin vencimiento previo, arranca hoy", () => {
    const p = calcularPeriodoPago({
      hoy: "2026-08-23",
      vencimientoActual: null,
      modalidad: "mensual",
    });

    expect(p).toEqual({ desde: "2026-08-23", hasta: "2026-09-23" });
  });

  it("semestral suma seis meses", () => {
    const p = calcularPeriodoPago({
      hoy: "2026-08-23",
      vencimientoActual: null,
      modalidad: "semestral",
    });

    expect(p).toEqual({ desde: "2026-08-23", hasta: "2027-02-23" });
  });

  it("dos pagos seguidos se encadenan sin huecos ni superposición", () => {
    const primero = calcularPeriodoPago({
      hoy: "2026-08-23",
      vencimientoActual: null,
      modalidad: "mensual",
    });
    const segundo = calcularPeriodoPago({
      hoy: "2026-09-01",
      vencimientoActual: primero.hasta,
      modalidad: "mensual",
    });

    expect(segundo.desde).toBe(primero.hasta);
    expect(segundo.hasta).toBe("2026-10-23");
  });
});
