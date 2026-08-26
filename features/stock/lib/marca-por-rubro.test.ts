import { describe, expect, it } from "vitest";
import {
  canonicalizarMarca,
  etiquetaMarca,
  rubroUsaMarca,
} from "./marca-por-rubro";

describe("rubroUsaMarca", () => {
  it("la piden los rubros cuya planilla la pide", () => {
    // El criterio sale de columnas-por-rubro, no de una lista paralela.
    expect(rubroUsaMarca("alimentos")).toBe(true);
    expect(rubroUsaMarca("quioscos")).toBe(true);
    expect(rubroUsaMarca("farmacia")).toBe(true);
    expect(rubroUsaMarca("ferreteria")).toBe(true);
  });

  it("no la piden los que identifican el producto de otra forma", () => {
    // Indumentaria razona por talle y color; electro por modelo + EAN.
    expect(rubroUsaMarca("indumentaria")).toBe(false);
    expect(rubroUsaMarca("electro")).toBe(false);
    expect(rubroUsaMarca("otros")).toBe(false);
  });
});

describe("etiquetaMarca", () => {
  it("en farmacia es el laboratorio", () => {
    expect(etiquetaMarca("farmacia")).toBe("Laboratorio");
    expect(etiquetaMarca("quioscos")).toBe("Marca");
  });
});

describe("canonicalizarMarca", () => {
  const existentes = ["popys", "Bingo Fuel", "RYC"];

  it("reusa la forma que ya está en el catálogo", () => {
    // El caso real: 42 productos en "popys" y 3 en "Popys".
    expect(canonicalizarMarca("Popys", existentes)).toBe("popys");
    expect(canonicalizarMarca("  bingo fuel ", existentes)).toBe("Bingo Fuel");
    expect(canonicalizarMarca("ryc", existentes)).toBe("RYC");
  });

  it("una marca nueva se guarda como la escribieron", () => {
    // Sin capitalizar a la fuerza: hay marcas que van así a propósito.
    expect(canonicalizarMarca("adidas", existentes)).toBe("adidas");
    expect(canonicalizarMarca("  Nike  ", existentes)).toBe("Nike");
  });

  it("vacío es null, no cadena vacía", () => {
    expect(canonicalizarMarca("", existentes)).toBeNull();
    expect(canonicalizarMarca("   ", existentes)).toBeNull();
    expect(canonicalizarMarca(null, existentes)).toBeNull();
    expect(canonicalizarMarca(undefined, existentes)).toBeNull();
  });
});
