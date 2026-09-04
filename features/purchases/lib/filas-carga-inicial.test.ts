import { describe, expect, it } from "vitest";
import type { ItemResuelto } from "@/entities/compras/types";
import {
  claveDeGrupo,
  construirFilasCargaInicial,
  filasAItems,
  precioSugerido,
} from "./filas-carga-inicial";
import type { CategoriaReal } from "./resolve-import-categoria";

const CATEGORIAS: CategoriaReal[] = [
  { id: "cat-camperas", nombre: "Camperas", slug: "camperas", parent_id: null },
];

function item(over: Partial<ItemResuelto>): ItemResuelto {
  return {
    id: crypto.randomUUID(),
    producto_id: null,
    raw_nombre: "campera rustica",
    raw_variante: "Talle: 4 / Color: negro",
    variante_match: "",
    cantidad: 1,
    precio_costo: 5000,
    estado_match: "DESCONOCIDO",
    ...over,
  };
}

describe("claveDeGrupo", () => {
  it("separa el mismo nombre con marcas distintas", () => {
    const a = claveDeGrupo({
      raw_nombre: "babucha rustica",
      raw_marca: "Cocos",
    });
    const b = claveDeGrupo({
      raw_nombre: "babucha rustica",
      raw_marca: "Bingo Fuel",
    });
    expect(a).not.toBe(b);
  });

  it("separa el mismo nombre con géneros distintos", () => {
    const a = claveDeGrupo({ raw_nombre: "bermuda chino", raw_genero: "nene" });
    const b = claveDeGrupo({
      raw_nombre: "bermuda chino",
      raw_genero: "hombre",
    });
    expect(a).not.toBe(b);
  });

  it("junta las variantes del mismo producto", () => {
    const a = claveDeGrupo({
      raw_nombre: "Campera Rustica",
      raw_marca: "Cocos",
    });
    const b = claveDeGrupo({
      raw_nombre: "campera rustica ",
      raw_marca: "cocos",
    });
    expect(a).toBe(b);
  });
});

describe("precioSugerido", () => {
  it("respeta el precio del proveedor cuando vino", () => {
    expect(precioSugerido(5000, 12500, 100)).toBe(12500);
  });

  it("calcula costo por recargo cuando no vino", () => {
    expect(precioSugerido(5000, null, 100)).toBe(10000);
    expect(precioSugerido(5000, null, 80)).toBe(9000);
  });

  it("sin costo no inventa un precio", () => {
    expect(precioSugerido(0, null, 100)).toBe(0);
  });
});

describe("construirFilasCargaInicial", () => {
  const items = [
    item({ raw_variante: "Talle: 4 / Color: negro", cantidad: 2 }),
    item({ raw_variante: "Talle: 6 / Color: negro", cantidad: 3 }),
    item({
      raw_nombre: "bermuda gabardina",
      raw_marca: "cocos",
      precio_costo: 3000,
    }),
  ];

  const filas = construirFilasCargaInicial({
    items,
    categorias: CATEGORIAS,
    rubro: "indumentaria",
    recargoPorcentaje: 100,
  });

  it("agrupa las variantes en una fila y deja las líneas adentro", () => {
    const campera = filas.find((f) => f.rawNombre === "campera rustica")!;
    expect(campera.lineas).toHaveLength(2);
    expect(campera.lineas.map((l) => l.cantidad)).toEqual([2, 3]);
  });

  it("prellena categoría, marca, costo y precio", () => {
    const campera = filas.find((f) => f.rawNombre === "campera rustica")!;
    expect(campera.categoriaId).toBe("cat-camperas");
    expect(campera.costo).toBe(5000);
    expect(campera.precio).toBe(10000);

    const bermuda = filas.find((f) => f.rawNombre === "bermuda gabardina")!;
    expect(bermuda.marca).toBe("cocos");
    // El comercio no tiene esa categoría: se propone crearla.
    expect(bermuda.categoriaId).toBeNull();
    expect(bermuda.categoriaNombreNueva).toBe("Shorts y bermudas");
  });

  it("toma el primer costo distinto de cero del grupo", () => {
    const [fila] = construirFilasCargaInicial({
      items: [
        item({ raw_nombre: "remera", precio_costo: 0 }),
        item({ raw_nombre: "remera", precio_costo: 4000 }),
      ],
      categorias: CATEGORIAS,
      rubro: "indumentaria",
      recargoPorcentaje: 100,
    });
    expect(fila.costo).toBe(4000);
  });

  it("marca como ya existente lo que el import reconoció", () => {
    const [fila] = construirFilasCargaInicial({
      items: [item({ estado_match: "PERFECTO", producto_id: "prod-1" })],
      categorias: CATEGORIAS,
      rubro: "indumentaria",
      recargoPorcentaje: 100,
    });
    expect(fila.yaExistia).toBe(true);
    expect(fila.productoId).toBe("prod-1");
  });
});

describe("filasAItems", () => {
  it("devuelve cada línea con el producto, costo, precio y cantidad de su fila", () => {
    const original = item({ cantidad: 2 });
    const [fila] = construirFilasCargaInicial({
      items: [original],
      categorias: CATEGORIAS,
      rubro: "indumentaria",
      recargoPorcentaje: 100,
    });

    const editada = { ...fila, costo: 6000, precio: 13000 };
    editada.lineas = [{ ...fila.lineas[0], cantidad: 5 }];

    const [resultado] = filasAItems([editada], [original], {
      "campera rustica": "prod-nuevo",
    });

    expect(resultado.producto_id).toBe("prod-nuevo");
    expect(resultado.cantidad).toBe(5);
    expect(resultado.precio_costo).toBe(6000);
    expect(resultado.precio_venta_actualizado).toBe(13000);
    expect(resultado.estado_match).toBe("NUEVO_ALIAS");
  });

  it("una línea sin producto creado no se marca como resuelta", () => {
    const original = item({});
    const [fila] = construirFilasCargaInicial({
      items: [original],
      categorias: CATEGORIAS,
      rubro: "indumentaria",
      recargoPorcentaje: 100,
    });
    const [resultado] = filasAItems([fila], [original], {});
    expect(resultado.producto_id).toBeNull();
    expect(resultado.estado_match).toBe("DESCONOCIDO");
  });
});
