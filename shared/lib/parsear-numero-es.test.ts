import { describe, expect, it } from "vitest";
import { parsearCantidadEs, parsearImporteEs } from "./parsear-numero-es";

describe("parsearCantidadEs", () => {
  it("acepta coma y punto como decimal", () => {
    expect(parsearCantidadEs("0,75")).toBe(0.75);
    expect(parsearCantidadEs("0.75")).toBe(0.75);
    expect(parsearCantidadEs("12,5")).toBe(12.5);
  });

  it("acepta enteros y espacios de más", () => {
    expect(parsearCantidadEs("3")).toBe(3);
    expect(parsearCantidadEs("  3 ")).toBe(3);
  });

  it("en cantidad, el punto NO es separador de miles", () => {
    // "1.500" tipeado en un campo de peso es 1,5 kg. Nadie vende 1.500 kilos
    // en un mostrador, y aceptar las dos lecturas obligaría a adivinar.
    expect(parsearCantidadEs("1.500")).toBe(1.5);
  });

  it("rechaza lo que no es un número", () => {
    expect(parsearCantidadEs("")).toBeNull();
    expect(parsearCantidadEs("   ")).toBeNull();
    expect(parsearCantidadEs("kilo")).toBeNull();
    expect(parsearCantidadEs("1.2.3")).toBeNull();
    expect(parsearCantidadEs("-1")).toBeNull();
  });
});

describe("parsearImporteEs", () => {
  it("el punto es separador de miles y la coma el decimal", () => {
    expect(parsearImporteEs("1.500")).toBe(1500);
    expect(parsearImporteEs("2.000")).toBe(2000);
    expect(parsearImporteEs("1.234,50")).toBe(1234.5);
    expect(parsearImporteEs("2000,50")).toBe(2000.5);
  });

  it("tolera el signo peso adelante", () => {
    expect(parsearImporteEs("$2.000")).toBe(2000);
  });

  it("rechaza lo que no es un importe", () => {
    expect(parsearImporteEs("")).toBeNull();
    expect(parsearImporteEs("dos mil")).toBeNull();
  });

  it("lee distinto que parsearCantidadEs el MISMO texto", () => {
    // Es la razón de que sean dos funciones: elegir mal acá es cobrar mil
    // veces de más o de menos.
    expect(parsearCantidadEs("1.500")).toBe(1.5);
    expect(parsearImporteEs("1.500")).toBe(1500);
  });
});
