import { describe, expect, it } from "vitest";
import {
  planillaALineasDeRemito,
  resumirPlanilla,
  varianteDesdeAtributos,
} from "./planilla-a-remito";
import type { FilaImport } from "./parse-productos-csv";
import { parseAttributeSegment } from "@/entities/productos/lib/parse-variant-attributes";

function fila(over: Partial<FilaImport> = {}): FilaImport {
  return {
    fila: 2,
    categoria: "Remeras",
    codigoBarras: null,
    producto: "Remera lisa",
    atributos: { Talle: "M", Color: "Negro" },
    stock: 3,
    imei: null,
    marca: null,
    modelo: null,
    genero: null,
    unidadMedida: null,
    precioCosto: 6000,
    precioVenta: 14900,
    ...over,
  };
}

describe("varianteDesdeAtributos", () => {
  it("etiqueta cada valor con su atributo, en el orden en que vinieron", () => {
    // Con etiqueta y no "M / Negro": la conciliación descarta todo segmento
    // sin ":", así que los valores pelados llegaban a la base como {} y la
    // variante se guardaba sin talle ni color.
    expect(varianteDesdeAtributos({ Talle: "M", Color: "Negro" })).toBe(
      "Talle: M / Color: Negro",
    );
  });

  it("lo que sale se puede volver a leer como atributos", () => {
    // El contrato real: este texto es lo único que viaja hasta
    // producto_variantes.atributos. Si no cierra el ida y vuelta, la variante
    // nace sin sus atributos y no hay error que lo diga.
    const atributos = { Talle: "M", Color: "Negro" };
    const leido: Record<string, string> = {};
    for (const segmento of varianteDesdeAtributos(atributos).split(" / ")) {
      const parsed = parseAttributeSegment(segmento);
      if (parsed) leido[parsed.nombre] = parsed.valor;
    }
    expect(leido).toEqual(atributos);
  });

  it("sin atributos devuelve 'Unico', no vacío", () => {
    // Cadena vacía se guardaría como una variante más; "Unico" es el valor que
    // ya usa el resto del sistema para el producto sin variantes.
    expect(varianteDesdeAtributos({})).toBe("Unico");
  });

  it("ignora los valores en blanco", () => {
    expect(varianteDesdeAtributos({ Talle: "M", Color: "  " })).toBe("Talle: M");
  });
});

describe("planillaALineasDeRemito", () => {
  it("arma la línea con la variante y el código de barras como SKU", () => {
    const [linea] = planillaALineasDeRemito([
      fila({ codigoBarras: "7791234567890" }),
    ]);

    expect(linea.raw_nombre).toBe("Remera lisa");
    expect(linea.raw_variante).toBe("Talle: M / Color: Negro");
    expect(linea.raw_sku).toBe("7791234567890");
    expect(linea.cantidad).toBe(3);
    expect(linea.precio_venta).toBe(14900);
  });

  it("el género viaja como raw_genero, no como atributo de variante", () => {
    // En un catálogo de indumentaria el género es el nivel de arriba del árbol
    // (Hombre > Camperas, Nena > Remeras). Estaba fijo en null, así que la
    // planilla propia entraba sin ese eje: la fila se quedaba sin categoría o
    // caía bajo la audiencia equivocada.
    const [linea] = planillaALineasDeRemito([fila({ genero: "Nena" })]);

    expect(linea.raw_genero).toBe("Nena");
    expect(linea.raw_variante).toBe("Talle: M / Color: Negro");
  });

  it("sin columna género la línea entra en null", () => {
    const [linea] = planillaALineasDeRemito([fila()]);
    expect(linea.raw_genero).toBeNull();
  });

  it("el IMEI viaja en la línea", () => {
    // Es lo que permite que electro entre por el mismo camino que el resto:
    // sin esto, conciliar una planilla de celulares perdería los números de
    // serie.
    const [linea] = planillaALineasDeRemito([
      fila({ imei: "356938035643809", stock: 1 }),
    ]);
    expect(linea.raw_imei).toBe("356938035643809");
  });

  it("sin precio de costo la línea entra en cero, no en null", () => {
    // La columna de la orden es numérica y no acepta null; cero es "no lo
    // sé todavía", que es lo que se corrige en la conciliación.
    const [linea] = planillaALineasDeRemito([fila({ precioCosto: null })]);
    expect(linea.precio_costo).toBe(0);
  });

  it("el precio de venta sí puede faltar", () => {
    // Se distingue de cero a propósito: null es "no vino en la planilla" y la
    // conciliación lo marca como fila que no se puede crear.
    const [linea] = planillaALineasDeRemito([fila({ precioVenta: null })]);
    expect(linea.precio_venta).toBeNull();
  });
});

describe("resumirPlanilla", () => {
  it("distingue filas de productos y de unidades", () => {
    // Una planilla de electro tiene una fila por aparato: 3 filas pueden ser
    // 3 unidades de 1 solo producto.
    const resumen = resumirPlanilla([
      fila({ producto: "Samsung A15", imei: "1", stock: 1 }),
      fila({ producto: "Samsung A15", imei: "2", stock: 1 }),
      fila({ producto: "Smart TV", stock: 4 }),
    ]);

    expect(resumen.filas).toBe(3);
    expect(resumen.productos).toBe(2);
    expect(resumen.unidades).toBe(6);
    expect(resumen.conImei).toBe(2);
  });

  it("cuenta el mismo producto escrito con distinto casing como uno solo", () => {
    const resumen = resumirPlanilla([
      fila({ producto: "Remera lisa" }),
      fila({ producto: "REMERA LISA" }),
    ]);
    expect(resumen.productos).toBe(1);
  });

  it("avisa cuántas filas no tienen precio de venta", () => {
    const resumen = resumirPlanilla([
      fila(),
      fila({ precioVenta: null }),
      fila({ precioVenta: 0 }),
    ]);
    expect(resumen.sinPrecioVenta).toBe(2);
  });
});
