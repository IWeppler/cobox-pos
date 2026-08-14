import { describe, it, expect } from "vitest";
import {
  claveAtributos,
  construirPlanImport,
  type CatalogoActual,
} from "./import-productos-plan";
import type { FilaImport } from "./parse-productos-csv";

function fila(over: Partial<FilaImport> & { fila: number; producto: string }): FilaImport {
  return {
    categoria: null,
    codigoBarras: null,
    atributos: {},
    stock: 1,
    imei: null,
    marca: null,
    modelo: null,
    unidadMedida: null,
    precioCosto: null,
    precioVenta: 1000,
    ...over,
  };
}

const catalogoVacio: CatalogoActual = {
  productos: [],
  variantes: [],
  categorias: [],
  imeisExistentes: new Set(),
};

describe("claveAtributos", () => {
  it("no depende del orden ni del casing", () => {
    expect(claveAtributos({ Color: "Negro", Memoria: "128GB" })).toBe(
      claveAtributos({ memoria: "128 gb", color: "negro" }),
    );
  });

  it("un producto sin atributos da clave vacía", () => {
    expect(claveAtributos({})).toBe("");
    expect(claveAtributos(null)).toBe("");
  });
});

describe("construirPlanImport — catálogo vacío", () => {
  it("crea el producto una vez y agrega variantes para las filas siguientes", () => {
    const plan = construirPlanImport(
      [
        fila({ fila: 2, producto: "Samsung A15", atributos: { Color: "Negro" } }),
        fila({ fila: 3, producto: "Samsung A15", atributos: { Color: "Azul" } }),
      ],
      catalogoVacio,
    );

    expect(plan.items[0].accion).toBe("CREAR_PRODUCTO");
    expect(plan.items[1].accion).toBe("CREAR_VARIANTE");
    expect(plan.resumen.productosNuevos).toBe(1);
    expect(plan.resumen.variantesNuevas).toBe(1);
  });

  it("dos filas de la misma variante suman stock en vez de duplicar la variante", () => {
    const plan = construirPlanImport(
      [
        fila({ fila: 2, producto: "Cargador", stock: 10 }),
        fila({ fila: 3, producto: "Cargador", stock: 5 }),
      ],
      catalogoVacio,
    );

    expect(plan.items[0].accion).toBe("CREAR_PRODUCTO");
    expect(plan.items[1].accion).toBe("SUMAR_STOCK");
    expect(plan.resumen.unidadesTotales).toBe(15);
  });

  it("bloquea un producto nuevo sin precio de venta", () => {
    const plan = construirPlanImport(
      [fila({ fila: 2, producto: "Remera", precioVenta: null })],
      catalogoVacio,
    );

    expect(plan.items[0].errores[0]).toContain("precio de venta");
    expect(plan.resumen.filasConError).toBe(1);
  });
});

describe("construirPlanImport — contra catálogo existente", () => {
  const catalogo: CatalogoActual = {
    productos: [{ id: "p1", nombre: "Samsung A15" }],
    variantes: [
      {
        id: "v1",
        productoId: "p1",
        sku: "7791234567890",
        atributos: { Color: "Negro", Memoria: "128GB" },
      },
    ],
    categorias: [{ id: "c1", nombre: "Celulares", slug: "celulares" }],
    imeisExistentes: new Set(["111111111111111"]),
  };

  it("suma stock cuando producto y atributos ya existen", () => {
    const plan = construirPlanImport(
      [
        fila({
          fila: 2,
          producto: "samsung a15",
          atributos: { color: "negro", memoria: "128 gb" },
          stock: 3,
        }),
      ],
      catalogo,
    );

    expect(plan.items[0].accion).toBe("SUMAR_STOCK");
    expect(plan.items[0].varianteId).toBe("v1");
  });

  it("agrega variante nueva a un producto existente sin exigir precio", () => {
    const plan = construirPlanImport(
      [
        fila({
          fila: 2,
          producto: "Samsung A15",
          atributos: { Color: "Azul", Memoria: "256GB" },
          precioVenta: null,
        }),
      ],
      catalogo,
    );

    expect(plan.items[0].accion).toBe("CREAR_VARIANTE");
    expect(plan.items[0].productoId).toBe("p1");
    expect(plan.items[0].errores).toEqual([]);
  });

  it("el código de barras gana sobre el nombre y avisa", () => {
    const plan = construirPlanImport(
      [
        fila({
          fila: 2,
          producto: "Samsun A15 (mal tipeado)",
          codigoBarras: "7791234567890",
        }),
      ],
      catalogo,
    );

    expect(plan.items[0].accion).toBe("SUMAR_STOCK");
    expect(plan.items[0].varianteId).toBe("v1");
    expect(plan.items[0].avisos.join(" ")).toContain("ya pertenece");
  });

  it("resuelve la categoría por nombre y avisa si no existe", () => {
    const plan = construirPlanImport(
      [
        fila({ fila: 2, producto: "Moto G54", categoria: "celulares" }),
        fila({ fila: 3, producto: "Heladera", categoria: "Línea Blanca" }),
      ],
      catalogo,
    );

    expect(plan.items[0].categoriaId).toBe("c1");
    expect(plan.items[1].categoriaId).toBeNull();
    expect(plan.items[1].avisos.join(" ")).toContain("no existe");
  });
});

describe("construirPlanImport — IMEI", () => {
  it("bloquea un IMEI que ya está en el sistema", () => {
    const plan = construirPlanImport(
      [fila({ fila: 2, producto: "Samsung A15", imei: "111111111111111" })],
      {
        ...catalogoVacio,
        imeisExistentes: new Set(["111111111111111"]),
      },
    );

    expect(plan.items[0].errores[0]).toContain("ya está cargado");
  });

  it("bloquea la segunda aparición de un IMEI repetido en el archivo", () => {
    const plan = construirPlanImport(
      [
        fila({ fila: 2, producto: "Samsung A15", imei: "222222222222222" }),
        fila({ fila: 3, producto: "Samsung A15", imei: "222222222222222" }),
      ],
      catalogoVacio,
    );

    expect(plan.items[0].errores).toEqual([]);
    expect(plan.items[1].errores[0]).toContain("fila 2");
  });

  it("cuenta las unidades serializadas en el resumen", () => {
    const plan = construirPlanImport(
      [
        fila({ fila: 2, producto: "Samsung A15", imei: "333333333333333" }),
        fila({ fila: 3, producto: "Samsung A15", imei: "444444444444444" }),
        fila({ fila: 4, producto: "Cargador", stock: 20 }),
      ],
      catalogoVacio,
    );

    expect(plan.resumen.unidadesSerie).toBe(2);
    expect(plan.resumen.unidadesTotales).toBe(22);
  });
});
