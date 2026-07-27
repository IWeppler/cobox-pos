import { describe, it, expect } from "vitest";
import {
  construirArbolCategorias,
  aplanarArbolCategorias,
  resolverCategoriaPorSlug,
  resolverCategoriaDisplayLabel,
} from "./category-tree";

describe("construirArbolCategorias", () => {
  it("árbol 100% plano (Evens hoy) — todo cae en sinPadre, cero padres", () => {
    const categorias = [
      { id: "1", nombre: "Remeras", slug: "remeras", parent_id: null },
      { id: "2", nombre: "Camperas", slug: "camperas", parent_id: null },
    ];
    const counts = { "1": 14, "2": 27 };

    const arbol = construirArbolCategorias(categorias, counts);

    expect(arbol.padres).toEqual([]);
    expect(arbol.sinPadre).toHaveLength(2);
    expect(arbol.sinPadre.map((c) => c.nombre).sort()).toEqual([
      "Camperas",
      "Remeras",
    ]);
  });

  it("árbol mixto (estilo bonito real): padres con hijos + categorías sueltas conviven", () => {
    const categorias = [
      { id: "mujer", nombre: "Ropa Mujer", slug: "ropa-mujer", parent_id: null },
      { id: "hombre", nombre: "Ropa Hombre", slug: "ropa-hombre", parent_id: null },
      { id: "boxer", nombre: "Boxer", slug: "boxer", parent_id: "hombre" },
      { id: "corpinos", nombre: "Corpiños", slug: "corpinos", parent_id: "mujer" },
      { id: "buzos", nombre: "Buzos", slug: "buzos", parent_id: null },
    ];
    const counts = { boxer: 11, corpinos: 6, buzos: 22 };

    const arbol = construirArbolCategorias(categorias, counts);

    expect(arbol.padres).toHaveLength(2);
    const ropaHombre = arbol.padres.find((p) => p.id === "hombre")!;
    expect(ropaHombre.count).toBe(11); // suma de sus hijos (propio = 0)
    expect(ropaHombre.hijos).toEqual([
      { id: "boxer", nombre: "Boxer", slug: "boxer", count: 11 },
    ]);

    expect(arbol.sinPadre).toEqual([
      { id: "buzos", nombre: "Buzos", slug: "buzos", count: 22 },
    ]);
  });

  it("categoría con parent_id pero 0 hijos con stock no aparece como padre", () => {
    const categorias = [
      { id: "ninos", nombre: "Ropa Niños", slug: "ropa-ninos", parent_id: null },
      { id: "remeras-ninos", nombre: "Remeras", slug: "remeras-ninos", parent_id: "ninos" },
    ];
    const counts = { "remeras-ninos": 0 }; // categoría creada, sin productos todavía

    const arbol = construirArbolCategorias(categorias, counts);

    expect(arbol.padres).toEqual([]);
    expect(arbol.sinPadre).toEqual([]); // tampoco aparece como suelta: 0 productos
  });

  it("el count de un padre suma su propio count directo + el de sus hijos", () => {
    const categorias = [
      { id: "p", nombre: "Padre", slug: "padre", parent_id: null },
      { id: "h", nombre: "Hijo", slug: "hijo", parent_id: "p" },
    ];
    const counts = { p: 3, h: 5 };

    const arbol = construirArbolCategorias(categorias, counts);

    expect(arbol.padres[0].count).toBe(8);
  });

  it("un chip no desaparece por una búsqueda que no matchea nada adentro — solo su número baja a 0", () => {
    const categorias = [
      { id: "hombre", nombre: "Ropa Hombre", slug: "ropa-hombre", parent_id: null },
      { id: "boxer", nombre: "Boxer", slug: "boxer", parent_id: "hombre" },
    ];
    // Existencia (solo stock): Boxer tiene 11 productos con stock.
    // Mostrado (facetado, con una búsqueda que no matchea nada): 0.
    const existencia = { boxer: 11 };
    const mostrado = { boxer: 0 };

    const arbol = construirArbolCategorias(categorias, existencia, mostrado);

    expect(arbol.padres).toHaveLength(1);
    expect(arbol.padres[0].count).toBe(0);
    expect(arbol.padres[0].hijos).toEqual([
      { id: "boxer", nombre: "Boxer", slug: "boxer", count: 0 },
    ]);
  });
});

describe("aplanarArbolCategorias", () => {
  it("devuelve padres + hijos + sueltas en una sola lista plana", () => {
    const arbol = construirArbolCategorias(
      [
        { id: "mujer", nombre: "Ropa Mujer", slug: "ropa-mujer", parent_id: null },
        { id: "boxer", nombre: "Boxer", slug: "boxer", parent_id: "mujer" },
        { id: "buzos", nombre: "Buzos", slug: "buzos", parent_id: null },
      ],
      { boxer: 11, buzos: 22 },
    );

    const plano = aplanarArbolCategorias(arbol);

    expect(plano.map((c) => c.nombre).sort()).toEqual([
      "Boxer",
      "Buzos",
      "Ropa Mujer",
    ]);
  });
});

describe("resolverCategoriaPorSlug", () => {
  const categorias = [
    { id: "hombre", nombre: "Ropa Hombre", slug: "ropa-hombre", parent_id: null },
    { id: "boxer", nombre: "Boxer", slug: "boxer", parent_id: "hombre" },
    { id: "buzos", nombre: "Buzos", slug: "buzos", parent_id: null },
  ];

  it("un padre resuelve a sí mismo, sin hijo", () => {
    expect(resolverCategoriaPorSlug(categorias, "ropa-hombre")).toEqual({
      padreId: "hombre",
      hijoId: null,
    });
  });

  it("un hijo resuelve a su padre real + su propio id — compat de links viejos", () => {
    // Ej: alguien compartió ?categoria=boxer cuando Boxer todavía era raíz.
    expect(resolverCategoriaPorSlug(categorias, "boxer")).toEqual({
      padreId: "hombre",
      hijoId: "boxer",
    });
  });

  it("una categoría suelta (sin hijos, sin padre) resuelve a sí misma como padreId", () => {
    expect(resolverCategoriaPorSlug(categorias, "buzos")).toEqual({
      padreId: "buzos",
      hijoId: null,
    });
  });

  it("no encuentra nada con un slug inexistente o vacío", () => {
    expect(resolverCategoriaPorSlug(categorias, "no-existe")).toBeNull();
    expect(resolverCategoriaPorSlug(categorias, "")).toBeNull();
  });

  it("resuelve sin importar si el link usa el id crudo en vez del slug", () => {
    expect(resolverCategoriaPorSlug(categorias, "boxer".toUpperCase())).toEqual({
      padreId: "hombre",
      hijoId: "boxer",
    });
  });
});

describe("resolverCategoriaDisplayLabel", () => {
  const categorias = [
    { id: "hombre", nombre: "Ropa Hombre", slug: "ropa-hombre", parent_id: null },
    { id: "boxer", nombre: "Boxer", slug: "boxer", parent_id: "hombre" },
    { id: "buzos", nombre: "Buzos", slug: "buzos", parent_id: null },
  ];

  it("categoría con padre: combina 'Padre › Hijo'", () => {
    expect(resolverCategoriaDisplayLabel(categorias, "boxer")).toBe(
      "Ropa Hombre › Boxer",
    );
  });

  it("categoría raíz (pendiente de migración, sin padre): solo el nombre", () => {
    expect(resolverCategoriaDisplayLabel(categorias, "buzos")).toBe("Buzos");
  });

  it("categoria_id vacío o nulo: string vacío", () => {
    expect(resolverCategoriaDisplayLabel(categorias, null)).toBe("");
    expect(resolverCategoriaDisplayLabel(categorias, undefined)).toBe("");
    expect(resolverCategoriaDisplayLabel(categorias, "")).toBe("");
  });

  it("categoria_id que no existe en la lista: string vacío", () => {
    expect(resolverCategoriaDisplayLabel(categorias, "no-existe")).toBe("");
  });

  it("padre huérfano (FK rota): cae al nombre propio en vez de romper", () => {
    const conPadreRoto = [
      { id: "boxer", nombre: "Boxer", slug: "boxer", parent_id: "fantasma" },
    ];
    expect(resolverCategoriaDisplayLabel(conPadreRoto, "boxer")).toBe("Boxer");
  });
});
