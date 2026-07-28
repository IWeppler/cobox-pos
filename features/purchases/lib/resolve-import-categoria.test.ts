import { describe, it, expect } from "vitest";
import {
  resolverCategoriaImport,
  mapGeneroRopaBebe,
  resolverAudienciaCategoria,
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

// Árbol por audiencia (estilo bonito): padre = audiencia, hijo = prenda.
const ARBOL_AUDIENCIA: CategoriaReal[] = [
  categoria("p-nina", "Ropa Niña", "ropa-nina"),
  categoria("p-nino", "Ropa Niño", "ropa-nino"),
  categoria("p-bebe", "Ropa Bebé", "ropa-bebe"),
  categoria("h-nina-remeras", "Remeras", "remeras", "p-nina"),
  categoria("h-nino-remeras", "Remeras", "remeras", "p-nino"),
  categoria("h-bebe-bodies", "Bodies", "bodies", "p-bebe"),
];

describe("resolverCategoriaImport — árbol por audiencia (bug 2026-07-28)", () => {
  it("género 'niño' NO cae en la subcategoría de Ropa Niña", () => {
    const r = resolverCategoriaImport("remera estampa", null, "niño", ARBOL_AUDIENCIA);
    expect(r?.categoriaId).toBe("h-nino-remeras");
  });

  it("género 'nene' resuelve al mismo padre que 'niño'", () => {
    const r = resolverCategoriaImport("remera estampa", null, "nene", ARBOL_AUDIENCIA);
    expect(r?.categoriaId).toBe("h-nino-remeras");
  });

  it("género 'nena'/'niña' resuelven a Ropa Niña", () => {
    for (const g of ["nena", "niña"]) {
      const r = resolverCategoriaImport("remera estampa", null, g, ARBOL_AUDIENCIA);
      expect(r?.categoriaId).toBe("h-nina-remeras");
    }
  });

  it("género 'beba' se detecta (antes caía al default → Remeras de Ropa Niña)", () => {
    // "blusa" y "remera" son la misma familia de prenda en REGLAS_CATEGORIA,
    // pero Ropa Bebé no tiene una subcategoría de esa familia -> sin
    // sugerencia, en vez de colgarlo de otra audiencia.
    const r = resolverCategoriaImport("blusa vueltio lino", null, "beba", ARBOL_AUDIENCIA);
    expect(r).toBeNull();
  });

  it("género 'beba' SÍ resuelve cuando el padre tiene esa familia de prenda", () => {
    const r = resolverCategoriaImport("body alondra", null, "beba", ARBOL_AUDIENCIA);
    expect(r?.categoriaId).toBe("h-bebe-bodies");
    expect(r?.esRopaBebe).toBe(true);
  });

  it("con árbol de audiencia y género desconocido, NO adivina por diccionario plano", () => {
    const r = resolverCategoriaImport("remera estampa", null, null, ARBOL_AUDIENCIA);
    expect(r).toBeNull();
  });

  it("catálogo PLANO (Evens) sigue usando el diccionario de siempre", () => {
    const plano = [categoria("c1", "ZAPATILLAS MUJER", "zapatillas-mujer")];
    const r = resolverCategoriaImport("Zapatilla urbana", null, "Mujer", plano);
    expect(r?.categoriaId).toBe("c1");
  });
});

describe("resolverAudienciaCategoria", () => {
  it("resuelve 'bebe' por slug, sin necesidad de estar en REGLAS_CATEGORIA", () => {
    const categorias = [categoria("c1", "ROPA BEBÉ", "ropa-bebe")];
    expect(resolverAudienciaCategoria("c1", categorias)).toBe("bebe");
  });

  it("resuelve 'bebe' vía un ancestro, para subcategorías", () => {
    const categorias = [
      categoria("padre", "ROPA BEBÉ", "ropa-bebe"),
      categoria("hijo", "Bodies", "bodies", "padre"),
    ];
    expect(resolverAudienciaCategoria("hijo", categorias)).toBe("bebe");
  });

  it("resuelve hombre/mujer/nena/nino por reverse-lookup contra REGLAS_CATEGORIA (nombre real)", () => {
    // Nombres copiados literales de REGLAS_CATEGORIA (category-suggestions.ts).
    const categorias = [
      categoria("c1", "ZAPATILLAS MUJER", "zapatillas-mujer"),
      categoria("c2", "ZAPATILLAS HOMBRE ", "zapatillas-hombre"),
      categoria("c3", "ZAPATILLAS NIÑAS", "zapatillas-ninas"),
      categoria("c4", "ZAPATILLAS NIÑOS", "zapatillas-ninos"),
    ];
    expect(resolverAudienciaCategoria("c1", categorias)).toBe("mujer");
    expect(resolverAudienciaCategoria("c2", categorias)).toBe("hombre");
    expect(resolverAudienciaCategoria("c3", categorias)).toBe("nena");
    expect(resolverAudienciaCategoria("c4", categorias)).toBe("nino");
  });

  it("devuelve null para categorías sin audiencia detectable (no excluye por error)", () => {
    const categorias = [categoria("c1", "ACCESORIOS", "accesorios")];
    expect(resolverAudienciaCategoria("c1", categorias)).toBeNull();
  });

  it("devuelve null si el id no existe en la lista", () => {
    expect(resolverAudienciaCategoria("inexistente", [])).toBeNull();
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
