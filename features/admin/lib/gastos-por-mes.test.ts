import { describe, expect, it } from "vitest";
import {
  gastoAplicaEnMes,
  gastosPorMes,
  totalGastadoEnMes,
  type GastoParaSerie,
} from "./gastos-por-mes";

const unico = (mes: string, monto: number): GastoParaSerie => ({
  tipo: "UNICO",
  mes,
  hasta: null,
  monto,
});

const fijo = (
  mes: string,
  monto: number,
  hasta: string | null = null,
): GastoParaSerie => ({ tipo: "FIJO", mes, hasta, monto });

describe("gastoAplicaEnMes", () => {
  it("un ÚNICO cuenta solo en su mes", () => {
    const g = unico("2026-03-01", 1000);
    expect(gastoAplicaEnMes(g, "2026-03")).toBe(true);
    expect(gastoAplicaEnMes(g, "2026-02")).toBe(false);
    expect(gastoAplicaEnMes(g, "2026-04")).toBe(false);
  });

  it("un FIJO sin baja cuenta desde su mes en adelante, para siempre", () => {
    const g = fijo("2026-03-01", 500);
    expect(gastoAplicaEnMes(g, "2026-02")).toBe(false);
    expect(gastoAplicaEnMes(g, "2026-03")).toBe(true);
    expect(gastoAplicaEnMes(g, "2026-12")).toBe(true);
    expect(gastoAplicaEnMes(g, "2030-01")).toBe(true);
  });

  it("un FIJO dado de baja cuenta hasta su último mes INCLUIDO", () => {
    const g = fijo("2026-01-01", 500, "2026-03-01");
    expect(gastoAplicaEnMes(g, "2025-12")).toBe(false);
    expect(gastoAplicaEnMes(g, "2026-01")).toBe(true);
    expect(gastoAplicaEnMes(g, "2026-03")).toBe(true);
    expect(gastoAplicaEnMes(g, "2026-04")).toBe(false);
  });

  it("dar de baja NO reescribe el pasado", () => {
    // Es la razón por la que la baja es una fecha y no un borrado: el margen
    // de enero tiene que seguir dando lo mismo después de dar de baja en marzo.
    const vigente = fijo("2026-01-01", 500);
    const dadoDeBaja = fijo("2026-01-01", 500, "2026-03-01");

    expect(totalGastadoEnMes([vigente], "2026-01")).toBe(
      totalGastadoEnMes([dadoDeBaja], "2026-01"),
    );
  });
});

describe("totalGastadoEnMes", () => {
  it("suma fijos y únicos del mismo mes", () => {
    const gastos = [
      fijo("2026-01-01", 500), // hosting
      unico("2026-03-01", 1200), // campaña
      unico("2026-02-01", 900), // otro mes, no cuenta
    ];

    expect(totalGastadoEnMes(gastos, "2026-03")).toBe(1700);
  });

  it("un mes sin gastos da cero, no NaN", () => {
    expect(totalGastadoEnMes([], "2026-03")).toBe(0);
  });
});

describe("gastosPorMes", () => {
  it("devuelve un total por mes, en el mismo orden", () => {
    const gastos = [fijo("2026-01-01", 100), unico("2026-02-01", 50)];

    expect(gastosPorMes(gastos, ["2026-01", "2026-02", "2026-03"])).toEqual([
      100, 150, 100,
    ]);
  });
});
