import { describe, expect, it } from "vitest";
import {
  detectarFusiones,
  identidadDeVariante,
  nombresPorProductoCompartido,
} from "./fusiones-remito";

const nombres: Record<string, string> = {
  "prod-alina": "VESTIDO EGRESADA ALINA",
  "prod-more": "VESTIDO EGRESADA MORE",
};
const nombrePorProducto = (id: string) => nombres[id];

describe("identidad de variante", () => {
  it("ignora mayúsculas, acentos y el orden de los segmentos", () => {
    expect(identidadDeVariante("Talle: U / Color: BORDO")).toBe(
      identidadDeVariante("COLOR: bordo / TALLE: u"),
    );
    expect(identidadDeVariante("Color: MARRÓN")).toBe(
      identidadDeVariante("color: marron"),
    );
  });

  it("distingue variantes que de verdad son distintas", () => {
    expect(identidadDeVariante("Talle: U / Color: BORDO")).not.toBe(
      identidadDeVariante("Talle: U / Color: VERDE"),
    );
  });

  it("trata la prenda sin variantes como identidad vacía", () => {
    expect(identidadDeVariante("Unico")).toBe("");
    expect(identidadDeVariante("único")).toBe("");
    expect(identidadDeVariante(null)).toBe("");
  });

  it("cae al texto cuando el segmento no tiene clave", () => {
    // Sin "clave: valor" no hay atributos que comparar: el texto es lo único
    // que distingue la fila, igual que la rama `display:` del guard de la RPC.
    expect(identidadDeVariante("XL")).toBe("display:xl");
    expect(identidadDeVariante("XL")).not.toBe(identidadDeVariante("L"));
  });
});

describe("fusiones del remito", () => {
  // Los tres casos son los del remito real de Evens del 28/8/2026, el que
  // dejó vestidos únicos con stock 2. Están escritos con sus nombres para que
  // se vea qué se está evitando.
  const remitoDelIncidente = [
    {
      raw_nombre: "VESTIDO EGRESADA ALANA",
      variante_match: "Talle: U / Color: BORDO",
      producto_id: "prod-alina",
    },
    {
      raw_nombre: "VESTIDO EGRESADA GEORGINA",
      variante_match: "Talle: U / Color: BORDO",
      producto_id: "prod-alina",
    },
    {
      raw_nombre: "VESTIDO EGRESADA ALANA",
      variante_match: "Talle: U / Color: VERDE",
      producto_id: "prod-alina",
    },
    {
      raw_nombre: "VESTIDO EGRESADA ALEJANDRA",
      variante_match: "Talle: U / Color: VERDE",
      producto_id: "prod-alina",
    },
    {
      raw_nombre: "VESTIDO EGRESADA CARLA",
      variante_match: "Talle: U / Color: CHOCOLATE",
      producto_id: "prod-more",
    },
    {
      raw_nombre: "VESTIDO EGRESADA RUBY",
      variante_match: "Talle: U / Color: CHOCOLATE",
      producto_id: "prod-more",
    },
  ];

  it("detecta las tres fusiones del remito del 28/8", () => {
    const fusiones = detectarFusiones(remitoDelIncidente, nombrePorProducto);

    expect(fusiones).toHaveLength(3);
    expect(fusiones.map((f) => f.nombres.join(" + "))).toEqual([
      "VESTIDO EGRESADA ALANA + VESTIDO EGRESADA GEORGINA",
      "VESTIDO EGRESADA ALANA + VESTIDO EGRESADA ALEJANDRA",
      "VESTIDO EGRESADA CARLA + VESTIDO EGRESADA RUBY",
    ]);
    expect(fusiones[0].productoNombre).toBe("VESTIDO EGRESADA ALINA");
  });

  it("NO marca la misma prenda repetida en dos renglones", () => {
    // El remito trae dos veces el mismo artículo: sumar es lo correcto.
    const fusiones = detectarFusiones(
      [
        {
          raw_nombre: "CAMISA M&C KIDS",
          variante_match: "Talle: 14 / Color: ROJO",
          producto_id: "prod-alina",
        },
        {
          raw_nombre: "CAMISA M&C KIDS",
          variante_match: "Talle: 14 / Color: ROJO",
          producto_id: "prod-alina",
        },
      ],
      nombrePorProducto,
    );

    expect(fusiones).toEqual([]);
  });

  it("NO marca dos prendas en el mismo producto con variantes distintas", () => {
    const fusiones = detectarFusiones(
      [
        {
          raw_nombre: "VESTIDO EGRESADA ALANA",
          variante_match: "Talle: U / Color: BORDO",
          producto_id: "prod-alina",
        },
        {
          raw_nombre: "VESTIDO EGRESADA GEORGINA",
          variante_match: "Talle: U / Color: PALO",
          producto_id: "prod-alina",
        },
      ],
      nombrePorProducto,
    );

    expect(fusiones).toEqual([]);
  });

  it("ignora las líneas todavía sin vincular", () => {
    const fusiones = detectarFusiones(
      [
        {
          raw_nombre: "CAMISA CADARUVE CR",
          variante_match: "Talle: 40 / Color: CELESTE A RAYAS",
          producto_id: null,
        },
        {
          raw_nombre: "CAMISA CADARUVE AMA",
          variante_match: "Talle: 40 / Color: CELESTE A RAYAS",
          producto_id: null,
        },
      ],
      nombrePorProducto,
    );

    expect(fusiones).toEqual([]);
  });

  it("usa raw_variante cuando todavía no hay variante_match", () => {
    const fusiones = detectarFusiones(
      [
        {
          raw_nombre: "VESTIDO EGRESADA ALANA",
          raw_variante: "Talle: U / Color: BORDO",
          producto_id: "prod-alina",
        },
        {
          raw_nombre: "VESTIDO EGRESADA GEORGINA",
          raw_variante: "COLOR: bordo / TALLE: u",
          producto_id: "prod-alina",
        },
      ],
      nombrePorProducto,
    );

    expect(fusiones).toHaveLength(1);
  });
});

describe("productos compartidos por varios nombres", () => {
  it("avisa antes de que haya choque de variante", () => {
    const compartidos = nombresPorProductoCompartido([
      {
        raw_nombre: "VESTIDO EGRESADA ALANA",
        variante_match: "Talle: U / Color: BORDO",
        producto_id: "prod-alina",
      },
      {
        raw_nombre: "VESTIDO EGRESADA GEORGINA",
        variante_match: "Talle: U / Color: PALO",
        producto_id: "prod-alina",
      },
      {
        raw_nombre: "VESTIDO EGRESADA CARLA",
        variante_match: "Talle: U / Color: CHOCOLATE",
        producto_id: "prod-more",
      },
    ]);

    expect(compartidos.size).toBe(1);
    expect(compartidos.get("prod-alina")).toEqual([
      "VESTIDO EGRESADA ALANA",
      "VESTIDO EGRESADA GEORGINA",
    ]);
  });
});
