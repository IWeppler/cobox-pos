import { describe, it, expect } from "vitest";
import {
  resolverCategoriaImport,
  mapGeneroRopaBebe,
  type CategoriaReal,
} from "./resolve-import-categoria";

function categoria(
  id: string,
  nombre: string,
  slug: string,
  parentId: string | null = null,
): CategoriaReal {
  return { id, nombre, slug, parent_id: parentId };
}

describe("resolverCategoriaImport", () => {
  it("matchea EXACTO contra el nombre real de una categoría (máxima confianza)", () => {
    const categorias = [categoria("c1", "CAMISAS ", "camisas")];
    const r = resolverCategoriaImport("Camisa a cuadros", "CAMISAS ", null, categorias);
    expect(r).not.toBeNull();
    expect(r?.categoriaId).toBe("c1");
    expect(r?.categoriaNombre).toBe("CAMISAS ");
  });

  it("sin columna Categoría (o sin match exacto), usa el diccionario de keywords ya existente (sugerirCategoria) contra el nombre del producto", () => {
    const categorias = [
      categoria("c1", "ZAPATILLAS MUJER", "zapatillas-mujer"),
      categoria("c2", "ZAPATILLAS HOMBRE ", "zapatillas-hombre"),
    ];
    // Sin columna Categoría explícita: matchea "zapatilla" del nombre +
    // género de la columna Género (separada) vía REGLAS_CATEGORIA.
    const r = resolverCategoriaImport("Zapatilla urbana", null, "Mujer", categorias);
    expect(r?.categoriaId).toBe("c1");
  });

  it("devuelve null (revisión manual) si no hay match exacto ni por keyword", () => {
    const categorias = [categoria("c1", "ACCESORIOS", "accesorios")];
    const r = resolverCategoriaImport("Objeto raro sin clasificar", null, null, categorias);
    expect(r).toBeNull();
  });

  it("devuelve null si la sugerencia por keyword no existe como categoría real (nunca crea una nueva)", () => {
    // Sin categorías reales cargadas: aunque "jean" matchee la regla de
    // JEANS Y PANTALONES HOMBRE, esa categoría no existe en el árbol.
    const r = resolverCategoriaImport("Jean elastizado", null, "Hombre", []);
    expect(r).toBeNull();
  });

  it("marca esRopaBebe cuando la categoría resuelta tiene 'bebe' en el slug", () => {
    const categorias = [categoria("c1", "ROPA BEBÉ", "ropa-bebe")];
    const r = resolverCategoriaImport("Body de bebé", "ROPA BEBÉ", null, categorias);
    expect(r?.esRopaBebe).toBe(true);
  });

  it("marca esRopaBebe cuando un ANCESTRO tiene 'bebe' en el slug (subcategoría)", () => {
    const categorias = [
      categoria("padre", "ROPA BEBÉ", "ropa-bebe"),
      categoria("hijo", "Bodies", "bodies", "padre"),
    ];
    const r = resolverCategoriaImport("Body de bebé", "Bodies", null, categorias);
    expect(r?.categoriaId).toBe("hijo");
    expect(r?.esRopaBebe).toBe(true);
  });

  it("NO marca esRopaBebe para categorías de Mujer/Hombre/Niña/Niño", () => {
    const categorias = [categoria("c1", "ZAPATILLAS MUJER", "zapatillas-mujer")];
    const r = resolverCategoriaImport("Zapatilla urbana", "ZAPATILLAS MUJER", null, categorias);
    expect(r?.esRopaBebe).toBe(false);
  });
});

describe("mapGeneroRopaBebe", () => {
  it("mapea Mujer/Niña a Beba", () => {
    expect(mapGeneroRopaBebe("Mujer")).toBe("Beba");
    expect(mapGeneroRopaBebe("Niña")).toBe("Beba");
  });

  it("mapea Hombre/Niño a Bebe", () => {
    expect(mapGeneroRopaBebe("Hombre")).toBe("Bebe");
    expect(mapGeneroRopaBebe("Niño")).toBe("Bebe");
  });

  it("cualquier otro valor (incluido null/Unisex/Bebé) cae a Unisex", () => {
    expect(mapGeneroRopaBebe(null)).toBe("Unisex");
    expect(mapGeneroRopaBebe("Unisex")).toBe("Unisex");
    expect(mapGeneroRopaBebe("Bebé")).toBe("Unisex");
  });
});
