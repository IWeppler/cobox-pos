import { describe, expect, it } from "vitest";
import {
  clasificarProductosCompartidos,
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

describe("clasificar productos compartidos: error o grafía", () => {
  const linea = (raw: string, producto: string, variante: string) => ({
    raw_nombre: raw,
    variante_match: variante,
    producto_id: producto,
  });
  const nombreDe = (id: string) =>
    ({
      "prod-more": "VESTIDO EGRESADA MORE",
      "prod-vera": "VESTIDO VERA",
      "prod-conjunto": "CONJUNTO IMPERAMBLE ATURE CON PIEL",
      "prod-camisa": "CAMISA CON BRODERIE",
    })[id];

  it("el caso MORE: cinco vestidos distintos, ningún color repetido", () => {
    // El que `detectarFusiones` NO puede ver, porque no hay dos nombres en la
    // misma variante. Es el que se aprobó el 28/8 sin una sola queja.
    const compartidos = clasificarProductosCompartidos(
      [
        linea("VESTIDO EGRESADA 11", "prod-more", "Talle: U / Color: BORDO"),
        linea("VESTIDO EGRESADA 212", "prod-more", "Talle: U"),
        linea("VESTIDO EGRESADA CARLA", "prod-more", "Talle: U / Color: CHOCOLATE"),
        linea("VESTIDO EGRESADA MIKA", "prod-more", "Talle: U / Color: ROJO"),
        linea("VESTIDO EGRESADA RUBY", "prod-more", "Talle: U / Color: BORDO 2"),
      ],
      nombreDe,
    );

    expect(compartidos).toHaveLength(1);
    expect(compartidos[0].nombres).toHaveLength(5);
    expect(compartidos[0].esMismaPrenda).toBe(false);
  });

  it("CAMISA CON BRODERIE: siete códigos de artículo distintos", () => {
    const compartidos = clasificarProductosCompartidos(
      [
        linea("CAMISA BRODERIE 1049", "prod-camisa", "Talle: U"),
        linea("CAMISA BRODERIE 1093", "prod-camisa", "Talle: 2"),
        linea("CAMISA BRODERIE 849", "prod-camisa", "Talle: 3"),
      ],
      nombreDe,
    );

    expect(compartidos[0].esMismaPrenda).toBe(false);
  });

  it("un typo del proveedor NO es un error: VESTIOD / VESTIDO VERA", () => {
    // Caso real del remito del 4/8. Avisar acá sería enseñar a ignorar avisos.
    //
    // El remito lleva otras líneas a propósito: lo que delata al typo es que
    // "VESTIDO" está en todas y "VESTIOD" en una sola. Con dos líneas sueltas
    // las dos palabras son igual de raras y no hay forma de distinguirlo — que
    // es exactamente lo que separa este caso de ALANA/ALINA.
    const compartidos = clasificarProductosCompartidos(
      [
        linea("VESTIDO VERA", "prod-vera", "Talle: U / Color: NEGRO"),
        linea("VESTIOD VERA", "prod-vera", "Talle: U / Color: ROJO"),
        linea("VESTIDO LARGO", "prod-otro", "Talle: U"),
        linea("VESTIDO CORTO", "prod-otro2", "Talle: U"),
      ],
      nombreDe,
    );

    const vera = compartidos.find((c) => c.productoId === "prod-vera")!;
    expect(vera.esMismaPrenda).toBe(true);
  });

  it("y sigue viendo ALANA / ALINA como prendas distintas en el mismo remito", () => {
    // El control de la regla de arriba: los dos pares están a una edición de
    // distancia. Lo que los separa es que "VESTIDO" se repite en el remito y
    // "ALANA" no.
    const compartidos = clasificarProductosCompartidos(
      [
        linea("VESTIDO EGRESADA ALANA", "prod-more", "Talle: U / Color: BORDO"),
        linea("VESTIDO EGRESADA ALINA", "prod-more", "Talle: U / Color: ROJO"),
        linea("VESTIDO EGRESADA CARLA", "prod-otro", "Talle: U"),
        linea("VESTIDO EGRESADA RUBY", "prod-otro2", "Talle: U"),
      ],
      nombreDe,
    );

    const more = compartidos.find((c) => c.productoId === "prod-more")!;
    expect(more.esMismaPrenda).toBe(false);
  });

  it("una palabra de más tampoco: el mismo conjunto con y sin ATURE", () => {
    const compartidos = clasificarProductosCompartidos(
      [
        linea("CONJUNTO IMPERAMBLE ATURE CON PIEL", "prod-conjunto", "Talle: 1"),
        linea("CONJUNTO IMPERAMBLE CON PIEL", "prod-conjunto", "Talle: 2"),
      ],
      nombreDe,
    );

    expect(compartidos[0].esMismaPrenda).toBe(true);
  });

  it("un solo nombre por producto no es compartir nada", () => {
    const compartidos = clasificarProductosCompartidos(
      [
        linea("VESTIDO EGRESADA MORE", "prod-more", "Talle: U"),
        linea("VESTIDO VERA", "prod-vera", "Talle: U"),
      ],
      nombreDe,
    );

    expect(compartidos).toHaveLength(0);
  });

  it("dos renglones del MISMO nombre no son compartir: el remito lo trajo dos veces", () => {
    const compartidos = clasificarProductosCompartidos(
      [
        linea("VESTIDO VERA", "prod-vera", "Talle: U / Color: NEGRO"),
        linea("VESTIDO VERA", "prod-vera", "Talle: U / Color: ROJO"),
      ],
      nombreDe,
    );

    expect(compartidos).toHaveLength(0);
  });
});
