import { describe, expect, it } from "vitest";
import { parseFechaDDMMYYYY } from "./parse-fecha-vencimiento";

describe("parseFechaDDMMYYYY", () => {
  const anioActual = new Date().getFullYear();

  it("parsea formato DD/MM/YYYY", () => {
    expect(parseFechaDDMMYYYY("31/12/2026")).toBe("2026-12-31");
  });

  it("parsea formato DD-MM-YYYY", () => {
    expect(parseFechaDDMMYYYY("05-01-2026")).toBe("2026-01-05");
  });

  it("rechaza fechas desbordadas (31/02)", () => {
    expect(parseFechaDDMMYYYY("31/02/2026")).toBeNull();
  });

  it("rechaza mes fuera de rango", () => {
    expect(parseFechaDDMMYYYY("10/13/2026")).toBeNull();
  });

  it("rechaza formato irreconocible", () => {
    expect(parseFechaDDMMYYYY("no es una fecha")).toBeNull();
  });

  it("devuelve null para string vacío", () => {
    expect(parseFechaDDMMYYYY("")).toBeNull();
  });

  // Casos reales del archivo CSV que mandó el cliente: día + mes abreviado
  // en español, sin año (formato que Excel/Sheets autogenera al exportar
  // una celda de fecha corta).
  describe("formato D-MMM / DD-MMM sin año (casos reales del cliente)", () => {
    it.each([
      ["13-ago", `${anioActual}-08-13`],
      ["10-ago", `${anioActual}-08-10`],
      ["1-ago", `${anioActual}-08-01`],
      ["20-jul", `${anioActual}-07-20`],
    ])("parsea '%s' -> %s", (input, esperado) => {
      expect(parseFechaDDMMYYYY(input)).toBe(esperado);
    });
  });

  it("acepta 'set' como alias de septiembre", () => {
    expect(parseFechaDDMMYYYY("5-set")).toBe(`${anioActual}-09-05`);
  });

  it("acepta mes abreviado con punto final", () => {
    expect(parseFechaDDMMYYYY("13-ago.")).toBe(`${anioActual}-08-13`);
  });

  it("es insensible a mayúsculas/minúsculas", () => {
    expect(parseFechaDDMMYYYY("13-AGO")).toBe(`${anioActual}-08-13`);
  });

  it("rechaza mes abreviado no reconocido", () => {
    expect(parseFechaDDMMYYYY("13-xyz")).toBeNull();
  });

  it("rechaza día fuera de rango en formato abreviado", () => {
    expect(parseFechaDDMMYYYY("32-ago")).toBeNull();
  });
});
