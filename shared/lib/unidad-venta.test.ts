import { describe, expect, it } from "vitest";
import {
  esFraccionable,
  formatearCantidad,
  normalizarCantidadVendible,
  pasoCantidad,
  redondearCantidad,
} from "./unidad-venta";

describe("esFraccionable", () => {
  it("peso, volumen y largo admiten fracción", () => {
    expect(esFraccionable("KG")).toBe(true);
    expect(esFraccionable("GRAMO")).toBe(true);
    expect(esFraccionable("LITRO")).toBe(true);
    expect(esFraccionable("METRO")).toBe(true);
  });

  it("unidad y par no: media remera y medio par no existen", () => {
    expect(esFraccionable("UNIDAD")).toBe(false);
    expect(esFraccionable("PAR")).toBe(false);
  });

  it("un valor desconocido cae a UNIDAD y por lo tanto no es fraccionable", () => {
    // Fail-closed: lo que no se entiende no se vende de a pedazos.
    expect(esFraccionable("kg")).toBe(false);
    expect(esFraccionable(null)).toBe(false);
    expect(esFraccionable(undefined)).toBe(false);
  });
});

describe("normalizarCantidadVendible", () => {
  it("deja pasar lo entero de siempre en productos por unidad", () => {
    // El caso de los 4 negocios vivos: esto no puede cambiar.
    expect(normalizarCantidadVendible(1, "UNIDAD")).toBe(1);
    expect(normalizarCantidadVendible(3, "UNIDAD")).toBe(3);
    expect(normalizarCantidadVendible("2", "UNIDAD")).toBe(2);
  });

  it("acepta peso con hasta tres decimales", () => {
    expect(normalizarCantidadVendible(0.75, "KG")).toBe(0.75);
    expect(normalizarCantidadVendible(12.5, "KG")).toBe(12.5);
    expect(normalizarCantidadVendible(0.001, "KG")).toBe(0.001);
  });

  it("redondea al gramo en vez de rechazar", () => {
    // La balanza puede mandar más decimales que los que guarda la columna.
    expect(normalizarCantidadVendible(0.7554, "KG")).toBe(0.755);
    expect(normalizarCantidadVendible(0.7556, "KG")).toBe(0.756);
  });

  it("rechaza decimales en productos que no son fraccionables", () => {
    expect(normalizarCantidadVendible(0.5, "UNIDAD")).toBeNull();
    expect(normalizarCantidadVendible(2.5, "PAR")).toBeNull();
  });

  it("rechaza cero, negativos y no-números", () => {
    // El negativo no es un error de tipeo: create-sale descuenta con
    // `-cantidad`, así que en negativo AGREGA stock y baja el total.
    expect(normalizarCantidadVendible(-1, "UNIDAD")).toBeNull();
    expect(normalizarCantidadVendible(-0.5, "KG")).toBeNull();
    expect(normalizarCantidadVendible(0, "UNIDAD")).toBeNull();
    expect(normalizarCantidadVendible(NaN, "KG")).toBeNull();
    expect(normalizarCantidadVendible(Infinity, "KG")).toBeNull();
    expect(normalizarCantidadVendible("dos", "UNIDAD")).toBeNull();
    expect(normalizarCantidadVendible(null, "UNIDAD")).toBeNull();
    expect(normalizarCantidadVendible(undefined, "UNIDAD")).toBeNull();
  });

  it("rechaza lo que se redondea a cero", () => {
    // Positivo pero más chico que un gramo: vender "cero" no es vender.
    expect(normalizarCantidadVendible(0.0004, "KG")).toBeNull();
  });

  it("rechaza lo que no entra en numeric(12,3)", () => {
    expect(normalizarCantidadVendible(1e12, "KG")).toBeNull();
  });
});

describe("redondearCantidad", () => {
  it("corta en tres decimales", () => {
    expect(redondearCantidad(0.12345)).toBe(0.123);
    expect(redondearCantidad(1)).toBe(1);
  });
});

describe("pasoCantidad", () => {
  it("un gramo para peso, uno para unidad", () => {
    expect(pasoCantidad("KG")).toBe(0.001);
    expect(pasoCantidad("UNIDAD")).toBe(1);
  });
});

describe("formatearCantidad", () => {
  it("por unidad va sin decimales", () => {
    expect(formatearCantidad(3, "UNIDAD")).toBe("3 u.");
  });

  it("por peso va con coma y sin ceros de relleno", () => {
    expect(formatearCantidad(0.75, "KG")).toBe("0,75 kg");
    expect(formatearCantidad(12.5, "KG")).toBe("12,5 kg");
    expect(formatearCantidad(2, "KG")).toBe("2 kg");
  });
});
