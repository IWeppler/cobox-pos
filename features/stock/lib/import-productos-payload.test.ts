import { describe, it, expect } from "vitest";
import { construirPayloadImport } from "./import-productos-payload";
import type { ItemPlan } from "./import-productos-plan";
import type { AtributoCache } from "./normalize-atributo";

const CACHE: AtributoCache = {
  Color: {
    nombreCanonico: "Color",
    atributoId: "attr-color",
    valores: {
      negro: { valorCanonico: "Negro", valorId: "val-negro" },
    },
  },
  Memoria: {
    nombreCanonico: "Memoria",
    atributoId: "attr-memoria",
    valores: {
      "128gb": { valorCanonico: "128GB", valorId: "val-128" },
    },
  },
};

function item(parcial: Partial<ItemPlan> = {}): ItemPlan {
  return {
    fila: 2,
    producto: "Samsung A15",
    atributos: {},
    imei: null,
    stock: 3,
    precioCosto: 100,
    precioVenta: 200,
    codigoBarras: null,
    accion: "CREAR_PRODUCTO",
    productoId: null,
    varianteId: null,
    categoriaId: null,
    categoriaNombre: null,
    errores: [],
    avisos: [],
    correcciones: [],
    ...parcial,
  };
}

describe("construirPayloadImport", () => {
  it("canonicaliza los atributos y arma el nombre_display con la forma canónica", () => {
    const [p] = construirPayloadImport(
      [item({ atributos: { Color: "negro", Memoria: "128gb" } })],
      CACHE,
      () => "abcd",
    );

    expect(p.atributos).toEqual({ Color: "Negro", Memoria: "128GB" });
    expect(p.nombre_display).toBe("Negro / 128GB");
  });

  it("sin atributos, la variante se llama Único", () => {
    const [p] = construirPayloadImport([item()], CACHE, () => "abcd");
    expect(p.nombre_display).toBe("Único");
    expect(p.relaciones).toEqual([]);
  });

  it("resuelve las relaciones a ids de atributo y valor", () => {
    const [p] = construirPayloadImport(
      [item({ atributos: { Color: "negro" } })],
      CACHE,
      () => "abcd",
    );

    expect(p.relaciones).toEqual([
      { atributo_id: "attr-color", atributo_valor_id: "val-negro" },
    ]);
  });

  it("descarta la relación cuyo valor no está en el cache, sin romper la fila", () => {
    const [p] = construirPayloadImport(
      [item({ atributos: { Color: "negro", Talle: "XL" } })],
      CACHE,
      () => "abcd",
    );

    expect(p.relaciones).toHaveLength(1);
    expect(p.atributos).toEqual({ Color: "Negro" });
  });

  it("el slug usa el nombre + la categoría y termina en el sufijo", () => {
    const [p] = construirPayloadImport(
      [item({ categoriaNombre: "Celulares" })],
      CACHE,
      () => "x1y2",
    );

    expect(p.slug).toBe("samsung-a15-celulares-x1y2");
  });

  it("sin categoría el slug cae a General (igual que el tipo del producto)", () => {
    const [p] = construirPayloadImport([item()], CACHE, () => "x1y2");
    expect(p.slug).toBe("samsung-a15-general-x1y2");
  });

  it("las claves de agrupación se calculan en Node: la RPC no slugifica", () => {
    const [p] = construirPayloadImport(
      [
        item({
          producto: "Samsung  A15",
          atributos: { Memoria: "128gb", Color: "negro" },
        }),
      ],
      CACHE,
      () => "abcd",
    );

    expect(p.clave_producto).toBe("samsung-a15");
    // Ordenada por nombre de atributo y sin separadores: color antes que memoria.
    expect(p.clave_variante).toBe("color=negro|memoria=128gb");
  });

  it("pasa derecho los ids ya resueltos por el plan", () => {
    const [p] = construirPayloadImport(
      [
        item({
          accion: "SUMAR_STOCK",
          productoId: "prod-1",
          varianteId: "var-1",
          imei: "355",
          stock: 1,
          codigoBarras: "779",
        }),
      ],
      CACHE,
      () => "abcd",
    );

    expect(p.producto_id).toBe("prod-1");
    expect(p.variante_id).toBe("var-1");
    expect(p.imei).toBe("355");
    expect(p.codigo_barras).toBe("779");
    expect(p.stock).toBe(1);
  });
});
