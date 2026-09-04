import { describe, expect, it } from "vitest";
import { inferirCategoriaFila } from "./inferir-categoria-fila";
import type { CategoriaReal } from "./resolve-import-categoria";

/** Comercio que arranca: cuatro categorías planas, sin árbol por audiencia.
 * Es el caso que motiva el modo carga inicial. */
const CATALOGO_CHICO: CategoriaReal[] = [
  { id: "cat-camperas", nombre: "Camperas", slug: "camperas", parent_id: null },
  { id: "cat-remeras", nombre: "Remeras", slug: "remeras", parent_id: null },
];

/** Comercio con árbol por audiencia (el de Evens, recortado). */
const CATALOGO_ARBOL: CategoriaReal[] = [
  { id: "nena", nombre: "NENA", slug: "nena", parent_id: null },
  {
    id: "nena-camperas",
    nombre: "CAMPERA NENA",
    slug: "campera-nena",
    parent_id: "nena",
  },
];

const BASE = {
  rawCategoria: null,
  rawCategoriaId: null,
  rawGenero: null,
  rubro: "indumentaria" as const,
};

describe("inferirCategoriaFila", () => {
  it("el ejemplo del pedido: CAMPERA RUSTICA ESTRELLITA cae en Camperas", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rawNombre: "CAMPERA RUSTICA ESTRELLITA",
      categorias: CATALOGO_CHICO,
    });
    expect(inferida.categoriaId).toBe("cat-camperas");
    expect(inferida.nombre).toBe("Camperas");
    expect(inferida.origen).toBe("LOCAL");
  });

  it("propone crear la categoría cuando el comercio no la tiene", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rawNombre: "bermuda gabardina",
      categorias: CATALOGO_CHICO,
    });
    expect(inferida.categoriaId).toBeNull();
    expect(inferida.nombre).toBe("Shorts y bermudas");
    expect(inferida.origen).toBe("NUEVA");
  });

  it("el árbol por audiencia gana sobre el diccionario genérico", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rawNombre: "campera rustica",
      rawGenero: "nena",
      categorias: CATALOGO_ARBOL,
    });
    expect(inferida.categoriaId).toBe("nena-camperas");
    expect(inferida.origen).toBe("ARBOL");
  });

  it("la categoría ya resuelta en el import manda sobre todo lo demás", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rawNombre: "campera rustica",
      rawCategoriaId: "cat-remeras",
      categorias: CATALOGO_CHICO,
    });
    expect(inferida.categoriaId).toBe("cat-remeras");
    expect(inferida.origen).toBe("ARCHIVO");
  });

  it("sin término conocido no inventa una categoría con el nombre del producto", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rawNombre: "estrellita fantasia 3000",
      categorias: CATALOGO_CHICO,
    });
    expect(inferida.origen).toBe("NINGUNA");
    expect(inferida.nombre).toBe("");
  });

  it("usa el diccionario del rubro del comercio", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rubro: "electro",
      rawNombre: "Heladera Whirlpool no frost",
      categorias: [],
    });
    expect(inferida.nombre).toBe("Electrodomésticos");
    expect(inferida.origen).toBe("NUEVA");
  });

  it("el rubro otros no adivina nada", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rubro: "otros",
      rawNombre: "campera rustica",
      categorias: CATALOGO_CHICO,
    });
    expect(inferida.origen).toBe("NINGUNA");
  });

  it("la columna Categoría del archivo alcanza aunque el nombre no diga nada", () => {
    const inferida = inferirCategoriaFila({
      ...BASE,
      rawNombre: "estrellita",
      rawCategoria: "camperas",
      categorias: CATALOGO_CHICO,
    });
    expect(inferida.categoriaId).toBe("cat-camperas");
  });
});
