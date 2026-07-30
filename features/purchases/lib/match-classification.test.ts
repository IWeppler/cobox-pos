import { describe, expect, it } from "vitest";
import {
  clasificarDesconocido,
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

const SIN_SIMILARES = new Map<string, CandidatoSimilar>();

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
    const similares = new Map<string, CandidatoSimilar>([
      [
        "REMERA LISA",
        {
          productoId: "p1",
          nombre: "REMERA LISA BLANCA",
          categoriaId: "mujer-remeras",
          marca: null,
          score: 0.9,
        },
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
