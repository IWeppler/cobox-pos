import { describe, expect, it } from "vitest";
import { construirSerieMrr, variacionMensual } from "./serie-mrr";

const HASTA = new Date("2026-08-14T12:00:00Z");

describe("construirSerieMrr", () => {
  it("agrupa por el mes en que entró la plata", () => {
    const serie = construirSerieMrr(
      [
        { monto: 30000, fecha_pago: "2026-08-03" },
        { monto: 50000, fecha_pago: "2026-08-28" },
        { monto: 30000, fecha_pago: "2026-07-05" },
      ],
      HASTA,
      3,
    );

    expect(serie.map((p) => p.etiqueta)).toEqual(["jun 26", "jul 26", "ago 26"]);
    expect(serie[2]).toMatchObject({ total: 80000, pagos: 2 });
    expect(serie[1]).toMatchObject({ total: 30000, pagos: 1 });
  });

  it("los meses sin pagos van en cero, no se omiten", () => {
    // Un hueco se lee como "falta el dato"; un mes sin cobrar es un dato.
    const serie = construirSerieMrr(
      [{ monto: 30000, fecha_pago: "2026-08-03" }],
      HASTA,
      3,
    );
    expect(serie).toHaveLength(3);
    expect(serie[0]).toMatchObject({ etiqueta: "jun 26", total: 0, pagos: 0 });
  });

  it("cruza el fin de año sin romper el orden", () => {
    const serie = construirSerieMrr(
      [{ monto: 10000, fecha_pago: "2025-12-15" }],
      new Date("2026-02-10T12:00:00Z"),
      4,
    );
    expect(serie.map((p) => p.etiqueta)).toEqual([
      "nov 25",
      "dic 25",
      "ene 26",
      "feb 26",
    ]);
    expect(serie[1].total).toBe(10000);
  });

  it("un pago del día 1 no se cae al mes anterior", () => {
    // El caso que rompe si se usan getters locales en vez de UTC.
    const serie = construirSerieMrr(
      [{ monto: 40000, fecha_pago: "2026-08-01" }],
      HASTA,
      2,
    );
    expect(serie[1]).toMatchObject({ etiqueta: "ago 26", total: 40000 });
    expect(serie[0].total).toBe(0);
  });

  it("sin pagos devuelve la serie completa en cero", () => {
    const serie = construirSerieMrr([], HASTA, 12);
    expect(serie).toHaveLength(12);
    expect(serie.every((p) => p.total === 0)).toBe(true);
  });
});

describe("variacionMensual", () => {
  it("compara el último mes contra el anterior", () => {
    const serie = construirSerieMrr(
      [
        { monto: 100000, fecha_pago: "2026-07-05" },
        { monto: 150000, fecha_pago: "2026-08-05" },
      ],
      HASTA,
      2,
    );
    expect(variacionMensual(serie)).toBe(50);
  });

  it("sin base de comparación no inventa un porcentaje", () => {
    // "+100%" porque el mes pasado fue cero no significa nada.
    const serie = construirSerieMrr(
      [{ monto: 150000, fecha_pago: "2026-08-05" }],
      HASTA,
      2,
    );
    expect(variacionMensual(serie)).toBeNull();
    expect(variacionMensual([])).toBeNull();
  });
});
