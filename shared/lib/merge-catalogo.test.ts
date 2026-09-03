import { describe, expect, it } from "vitest";
import { mergearCatalogo } from "./merge-catalogo";
import type { Producto, ProductoVariante } from "@/entities/productos/types";
import type { CatalogoPanel } from "@/shared/actions/catalogo-panel";
import type { CatalogoDelta } from "@/shared/actions/catalogo-delta";

const RESTO = {
  categorias: [{ id: "c1", nombre: "Remeras", slug: "remeras" }],
  permitirVentaSinStock: false,
  nombreComercio: "Evens",
  mostrarSinStock: true,
  rubro: "indumentaria" as const,
};

function variante(id: string, stock = 5): ProductoVariante {
  return {
    id,
    nombre_display: `Talle ${id}`,
    precio: 1000,
    stock,
    stock_disponible: stock,
  };
}

function producto(
  id: string,
  creadoEn: string,
  variantes: ProductoVariante[] = [variante(`${id}-v1`)],
): Producto {
  return {
    id,
    nombre: `Producto ${id}`,
    tipo: "simple",
    precio: 1000,
    imagen_url: null,
    grid_url: null,
    creado_en: creadoEn,
    publicado: true,
    slug: id,
    producto_variantes: variantes,
  };
}

function panel(productos: Producto[], cursor = "2026-09-03T10:00:00.000Z"): CatalogoPanel {
  return { ...RESTO, productos, cursor };
}

function delta(parcial: Partial<CatalogoDelta> = {}): CatalogoDelta {
  return {
    resto: RESTO,
    productos: [],
    borrados: [],
    reservasPorVariante: {},
    cursor: "2026-09-03T10:05:00.000Z",
    completo: false,
    ...parcial,
  };
}

describe("mergearCatalogo", () => {
  it("un delta vacío deja el catálogo igual y solo mueve el cursor", () => {
    const anterior = panel([producto("a", "2026-09-01T00:00:00Z")]);

    const resultado = mergearCatalogo(anterior, delta());

    expect(resultado.productos).toHaveLength(1);
    // MISMA identidad: sin esto la grilla del POS se re-renderiza entera cada
    // vez que sincroniza, que es cada 3 minutos.
    expect(resultado.productos[0]).toBe(anterior.productos[0]);
    expect(resultado.cursor).toBe("2026-09-03T10:05:00.000Z");
  });

  it("reemplaza por id en vez de duplicar", () => {
    const anterior = panel([producto("a", "2026-09-01T00:00:00Z")]);
    const modificado = { ...producto("a", "2026-09-01T00:00:00Z"), precio: 9999 };

    const resultado = mergearCatalogo(anterior, delta({ productos: [modificado] }));

    expect(resultado.productos).toHaveLength(1);
    expect(resultado.productos[0].precio).toBe(9999);
  });

  it("aplicar dos veces el mismo delta da lo mismo (el solapamiento re-trae)", () => {
    const anterior = panel([producto("a", "2026-09-01T00:00:00Z")]);
    const d = delta({ productos: [producto("b", "2026-09-02T00:00:00Z")] });

    const unaVez = mergearCatalogo(anterior, d);
    const dosVeces = mergearCatalogo(unaVez, d);

    expect(dosVeces.productos.map((p) => p.id)).toEqual(unaVez.productos.map((p) => p.id));
  });

  it("un producto nuevo entra en el orden del servidor, no al final", () => {
    const anterior = panel([
      producto("viejo", "2026-08-01T00:00:00Z"),
      producto("masviejo", "2026-07-01T00:00:00Z"),
    ]);

    const resultado = mergearCatalogo(
      anterior,
      delta({ productos: [producto("nuevo", "2026-09-02T00:00:00Z")] }),
    );

    expect(resultado.productos.map((p) => p.id)).toEqual([
      "nuevo",
      "viejo",
      "masviejo",
    ]);
  });

  it("desempata por id cuando dos productos se crearon en el mismo instante", () => {
    const anterior = panel([]);
    const resultado = mergearCatalogo(
      anterior,
      delta({
        productos: [
          producto("z", "2026-09-02T00:00:00Z"),
          producto("a", "2026-09-02T00:00:00Z"),
        ],
      }),
    );

    expect(resultado.productos.map((p) => p.id)).toEqual(["a", "z"]);
  });

  it("una baja de producto lo saca de la copia local", () => {
    const anterior = panel([
      producto("a", "2026-09-01T00:00:00Z"),
      producto("b", "2026-09-02T00:00:00Z"),
    ]);

    const resultado = mergearCatalogo(
      anterior,
      delta({ borrados: [{ tabla: "productos", fila_id: "a" }] }),
    );

    expect(resultado.productos.map((p) => p.id)).toEqual(["b"]);
  });

  it("una baja de variante saca el talle y deja el producto vivo", () => {
    const anterior = panel([
      producto("a", "2026-09-01T00:00:00Z", [variante("v1"), variante("v2")]),
    ]);

    const resultado = mergearCatalogo(
      anterior,
      delta({ borrados: [{ tabla: "producto_variantes", fila_id: "v1" }] }),
    );

    expect(resultado.productos).toHaveLength(1);
    expect(resultado.productos[0].producto_variantes?.map((v) => v.id)).toEqual(["v2"]);
  });

  it("una baja de categoría no toca los productos (la lista viene completa)", () => {
    const anterior = panel([producto("a", "2026-09-01T00:00:00Z")]);

    const resultado = mergearCatalogo(
      anterior,
      delta({ borrados: [{ tabla: "categorias", fila_id: "c9" }] }),
    );

    expect(resultado.productos).toHaveLength(1);
    expect(resultado.categorias).toEqual(RESTO.categorias);
  });

  it("con `completo` reemplaza la copia local en vez de mergear", () => {
    const anterior = panel([producto("viejo", "2026-08-01T00:00:00Z")]);

    const resultado = mergearCatalogo(
      anterior,
      delta({ completo: true, productos: [producto("a", "2026-09-01T00:00:00Z")] }),
    );

    expect(resultado.productos.map((p) => p.id)).toEqual(["a"]);
  });

  it("aplica las reservas a productos que el delta NO trajo", () => {
    // El caso que motiva `reservasPorVariante`: se aparta una unidad y el
    // producto no cambia de fila, así que nunca viene en un delta.
    const anterior = panel([
      producto("a", "2026-09-01T00:00:00Z", [variante("v1", 5)]),
    ]);

    const resultado = mergearCatalogo(
      anterior,
      delta({ reservasPorVariante: { v1: 2 } }),
    );

    const v = resultado.productos[0].producto_variantes?.[0];
    expect(v?.stock).toBe(5);
    expect(v?.stock_disponible).toBe(3);
  });

  it("re-anotar lo que el servidor ya anotó no lo cambia", () => {
    const yaAnotado = { ...variante("v1", 5), stock_disponible: 3 };
    const anterior = panel([producto("a", "2026-09-01T00:00:00Z", [yaAnotado])]);

    const resultado = mergearCatalogo(
      anterior,
      delta({ reservasPorVariante: { v1: 2 } }),
    );

    expect(resultado.productos[0].producto_variantes?.[0].stock_disponible).toBe(3);
    // Nada cambió: la identidad se conserva.
    expect(resultado.productos[0]).toBe(anterior.productos[0]);
  });

  it("el resto del catálogo sale SIEMPRE del delta, no de la copia vieja", () => {
    const anterior = panel([]);
    const resultado = mergearCatalogo(
      anterior,
      delta({ resto: { ...RESTO, nombreComercio: "Evens Indumentaria" } }),
    );

    expect(resultado.nombreComercio).toBe("Evens Indumentaria");
  });
});
