import { describe, expect, it } from "vitest";
import { describirSeleccion } from "./describir-seleccion";

const COMERCIO = "Evens Indumentaria";

describe("describirSeleccion", () => {
  it("sin productos resueltos cae al texto genérico", () => {
    const { title, description } = describirSeleccion([], COMERCIO);
    expect(title).toBe("Productos seleccionados | Evens Indumentaria");
    expect(description).toContain("selección de productos");
  });

  it("con un solo producto se comporta como el link individual", () => {
    const { title, description } = describirSeleccion(
      [{ nombre: "BUZO CANGURO FRIZADO", precio: 29000 }],
      COMERCIO,
    );
    expect(title).toBe("BUZO CANGURO FRIZADO | Evens Indumentaria");
    expect(description).toContain("29.000");
    expect(description).toContain("BUZO CANGURO FRIZADO");
  });

  it("sin precio no inventa un monto", () => {
    const { description } = describirSeleccion(
      [{ nombre: "BUZO", precio: null }],
      COMERCIO,
    );
    expect(description).toBe("Comprá BUZO en Evens Indumentaria.");
  });

  it("con varios productos los nombra y cuenta el resto", () => {
    const { title, description } = describirSeleccion(
      [
        { nombre: "BUZO" },
        { nombre: "CAMPERA" },
        { nombre: "GORRA" },
        { nombre: "MEDIAS" },
        { nombre: "SHORT" },
      ],
      COMERCIO,
    );
    expect(title).toBe("5 productos seleccionados | Evens Indumentaria");
    expect(description).toBe(
      "BUZO, CAMPERA, GORRA y 2 más — selección de Evens Indumentaria.",
    );
  });

  it("no agrega 'y N más' cuando entran todos", () => {
    const { description } = describirSeleccion(
      [{ nombre: "BUZO" }, { nombre: "CAMPERA" }],
      COMERCIO,
    );
    expect(description).toBe("BUZO, CAMPERA — selección de Evens Indumentaria.");
  });

  it("recorta la descripción al límite de los scrapers", () => {
    const largos = Array.from({ length: 4 }, (_, i) => ({
      nombre: `PRODUCTO CON NOMBRE MUY LARGO NUMERO ${i} ${"X".repeat(40)}`,
    }));
    const { description } = describirSeleccion(largos, COMERCIO);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith("…")).toBe(true);
  });
});
