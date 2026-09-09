import { describe, expect, it } from "vitest";
import {
  clasificarDesconocido,
  construirMapaSimilares,
  type CandidatoSimilar,
} from "./match-classification";
import type { CategoriaReal } from "./resolve-import-categoria";

/**
 * Árbol real de Evens (recortado): padres por audiencia CON hijos, más
 * categorías raíz que no son de ropa. Esa mezcla es la que rompía: el corte
 * por árbol de audiencia descartaba todo lo que no fuera Mujer/Hombre/...
 */
const CATEGORIAS: CategoriaReal[] = [
  { id: "mujer", nombre: "MUJER", slug: "mujer", parent_id: null },
  {
    id: "mujer-remeras",
    nombre: "REMERAS Y BLUSAS",
    slug: "remeras-y-blusas",
    parent_id: "mujer",
  },
  { id: "juguetes", nombre: "JUGUETES", slug: "juguetes", parent_id: null },
];

const SIN_SIMILARES = new Map<string, CandidatoSimilar[]>();

describe("clasificarDesconocido con categoría del archivo", () => {
  it("usa la categoría que el import ya resolvió", () => {
    const bucket = clasificarDesconocido(
      "AUTO CONTROL REMOTO",
      SIN_SIMILARES,
      null,
      CATEGORIAS,
      "JUGUETES",
      "juguetes",
    );

    expect(bucket).toEqual({
      tipo: "NUEVO_SUGERIDO",
      categoriaSugerida: {
        categoriaNombre: "JUGUETES",
        matchedKeyword: "categoría del archivo",
      },
      categoriaId: "juguetes",
    });
  });

  it("resuelve por el nombre de la columna aunque el import no haya dejado id", () => {
    const bucket = clasificarDesconocido(
      "CAMIONES X4",
      SIN_SIMILARES,
      null,
      CATEGORIAS,
      "JUGUETES",
      null,
    );

    expect(bucket).toMatchObject({
      tipo: "NUEVO_SUGERIDO",
      categoriaId: "juguetes",
    });
  });

  it("sin categoría en el archivo sigue siendo Ambiguo (no inventa una de ropa)", () => {
    // El comportamiento que ya existía: con árbol de audiencia y sin señal
    // confiable, Ambiguo es mejor que colgar la fila de otra audiencia.
    const bucket = clasificarDesconocido(
      "AUTO CONTROL REMOTO",
      SIN_SIMILARES,
      null,
      CATEGORIAS,
      null,
      null,
    );

    expect(bucket).toEqual({ tipo: "AMBIGUO" });
  });

  it("ignora un id que ya no existe en el árbol y no rompe", () => {
    const bucket = clasificarDesconocido(
      "AUTO CONTROL REMOTO",
      SIN_SIMILARES,
      null,
      CATEGORIAS,
      null,
      "categoria-borrada",
    );

    expect(bucket).toEqual({ tipo: "AMBIGUO" });
  });

  it("un producto existente parecido sigue ganando sobre la categoría del archivo", () => {
    const similares = new Map<string, CandidatoSimilar[]>([
      [
        "REMERA LISA",
        [
          {
            productoId: "p1",
            nombre: "REMERA LISA BLANCA",
            categoriaId: "mujer-remeras",
            marca: null,
            score: 0.9,
          },
        ],
      ],
    ]);

    const bucket = clasificarDesconocido(
      "REMERA LISA",
      similares,
      "Mujer",
      CATEGORIAS,
      "JUGUETES",
      "juguetes",
    );

    expect(bucket.tipo).toBe("POSIBLE_MATCH");
  });
});

describe("construirMapaSimilares", () => {
  const sug = (raw: string, id: string, nombre: string, score: number) => ({
    raw_nombre: raw,
    producto_id: id,
    producto_nombre: nombre,
    categoria_id: null,
    marca: null,
    score,
  });

  it("conserva TODOS los candidatos, no solo el mejor", () => {
    const mapa = construirMapaSimilares([
      sug("VESTIDO EGRESADA LUNA", "p2", "VESTIDO EGRESADA LUCI", 0.74),
      sug("VESTIDO EGRESADA LUNA", "p1", "VESTIDO EGRESADA ALANA", 0.77),
      sug("VESTIDO EGRESADA LUNA", "p3", "VESTIDO EGRESADA AMBAR", 0.64),
    ]);

    expect(mapa.get("VESTIDO EGRESADA LUNA")).toHaveLength(3);
  });

  it("los ordena de mejor a peor sin confiar en el orden de entrada", () => {
    const mapa = construirMapaSimilares([
      sug("REMERA", "p2", "REMERA LISA", 0.62),
      sug("REMERA", "p1", "REMERA BLANCA", 0.91),
    ]);

    expect(mapa.get("REMERA")?.map((c) => c.productoId)).toEqual(["p1", "p2"]);
  });

  it("no repite el mismo producto: dos botones iguales no son una elección", () => {
    const mapa = construirMapaSimilares([
      sug("REMERA", "p1", "REMERA BLANCA", 0.91),
      sug("REMERA", "p1", "REMERA BLANCA", 0.91),
    ]);

    expect(mapa.get("REMERA")).toHaveLength(1);
  });

  it("clasificarDesconocido ofrece el mejor y arrastra el resto", () => {
    const mapa = construirMapaSimilares([
      sug("VESTIDO EGRESADA LUNA", "p1", "VESTIDO EGRESADA ALANA", 0.77),
      sug("VESTIDO EGRESADA LUNA", "p2", "VESTIDO EGRESADA LUCI", 0.74),
    ]);

    const bucket = clasificarDesconocido("VESTIDO EGRESADA LUNA", mapa);

    expect(bucket).toMatchObject({ tipo: "POSIBLE_MATCH" });
    if (bucket.tipo !== "POSIBLE_MATCH") return;
    expect(bucket.candidato.productoId).toBe("p1");
    expect(bucket.candidatos).toHaveLength(2);
  });
});
