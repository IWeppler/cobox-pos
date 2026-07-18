import { describe, it, expect } from "vitest";
import { calcularFechaVencimiento } from "./calcular-fecha-vencimiento";

describe("calcularFechaVencimiento", () => {
  it("suma los días al día calendario de la fecha de venta", () => {
    expect(
      calcularFechaVencimiento("2026-07-18T14:46:00.000Z", 30),
    ).toBe("2026-08-17");
  });

  it("cruza correctamente un fin de mes/año", () => {
    expect(
      calcularFechaVencimiento("2026-12-15T00:00:00.000Z", 30),
    ).toBe("2027-01-14");
  });

  it("ignora la hora del timestamp, solo usa el día calendario UTC", () => {
    expect(calcularFechaVencimiento("2026-07-18T23:59:59.000Z", 1)).toBe(
      calcularFechaVencimiento("2026-07-18T00:00:00.000Z", 1),
    );
  });

  it("acepta un objeto Date directamente", () => {
    const fecha = new Date(Date.UTC(2026, 0, 1));
    expect(calcularFechaVencimiento(fecha, 30)).toBe("2026-01-31");
  });
});
