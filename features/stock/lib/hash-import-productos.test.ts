import { describe, it, expect } from "vitest";
import { hashPlanillaProductos } from "./hash-import-productos";
import type { FilaImport } from "./parse-productos-csv";

function fila(parcial: Partial<FilaImport> = {}): FilaImport {
  return {
    fila: 2,
    categoria: "Celulares",
    codigoBarras: "779123",
    producto: "Samsung A15",
    atributos: { Color: "Negro", Memoria: "128GB" },
    stock: 3,
    imei: null,
    marca: null,
    modelo: null,
    unidadMedida: null,
    precioCosto: 100,
    precioVenta: 200,
    ...parcial,
  };
}

describe("hashPlanillaProductos", () => {
  it("el mismo contenido da el mismo hash", () => {
    expect(hashPlanillaProductos([fila()])).toBe(
      hashPlanillaProductos([fila()]),
    );
  });

  it("no depende del orden en que se poblaron los atributos", () => {
    const a = hashPlanillaProductos([
      fila({ atributos: { Color: "Negro", Memoria: "128GB" } }),
    ]);
    const b = hashPlanillaProductos([
      fila({ atributos: { Memoria: "128GB", Color: "Negro" } }),
    ]);
    expect(a).toBe(b);
  });

  it("cambiar una cantidad cambia el hash (ahí SÍ se quiere reimportar)", () => {
    expect(hashPlanillaProductos([fila({ stock: 3 })])).not.toBe(
      hashPlanillaProductos([fila({ stock: 4 })]),
    );
  });

  it("cambiar un precio cambia el hash", () => {
    expect(hashPlanillaProductos([fila({ precioVenta: 200 })])).not.toBe(
      hashPlanillaProductos([fila({ precioVenta: 250 })]),
    );
  });

  it("agregar una fila cambia el hash", () => {
    expect(hashPlanillaProductos([fila()])).not.toBe(
      hashPlanillaProductos([fila(), fila({ fila: 3, producto: "Motorola" })]),
    );
  });

  it("distingue null de string vacío sin colisionar", () => {
    expect(hashPlanillaProductos([fila({ imei: null })])).toBe(
      hashPlanillaProductos([fila({ imei: null })]),
    );
    expect(hashPlanillaProductos([fila({ imei: null })])).not.toBe(
      hashPlanillaProductos([fila({ imei: "355" })]),
    );
  });

  it("el orden de las filas importa: no es el mismo archivo", () => {
    const f2 = fila({ fila: 2, producto: "A" });
    const f3 = fila({ fila: 3, producto: "B" });
    expect(hashPlanillaProductos([f2, f3])).not.toBe(
      hashPlanillaProductos([f3, f2]),
    );
  });

  it("devuelve un sha256 en hex", () => {
    expect(hashPlanillaProductos([fila()])).toMatch(/^[0-9a-f]{64}$/);
  });
});
