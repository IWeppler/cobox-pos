import { describe, expect, it } from "vitest";
import type { Producto } from "@/entities/productos/types";
import {
  construirPortadaCategorias,
  esModoPortada,
  imagenDePortada,
  destacados,
  MAX_DESTACADOS,
  recienLlegados,
  seleccionPortada,
} from "./portada-catalogo";

const producto = (over: Partial<Producto>): Producto =>
  ({ id: "1", nombre: "P", precio: 0, ...over }) as Producto;

const baseModo = {
  modoSeleccion: false,
  tipo: "todos",
  searchQuery: "",
  verTodo: false,
  cantidadFiltrosVariante: 0,
};

describe("esModoPortada", () => {
  it("muestra la portada en la home limpia", () => {
    expect(esModoPortada(baseModo)).toBe(true);
  });

  it("una búsqueda gana sobre la portada", () => {
    expect(esModoPortada({ ...baseModo, searchQuery: "remera" })).toBe(false);
  });

  it("espacios en blanco no cuentan como búsqueda", () => {
    expect(esModoPortada({ ...baseModo, searchQuery: "   " })).toBe(true);
  });

  it("entrar a una categoría gana sobre la portada", () => {
    expect(esModoPortada({ ...baseModo, tipo: "cat-1" })).toBe(false);
  });

  it("un filtro de variante activo gana sobre la portada", () => {
    expect(esModoPortada({ ...baseModo, cantidadFiltrosVariante: 1 })).toBe(
      false,
    );
  });

  it("un link compartido gana sobre la portada", () => {
    expect(esModoPortada({ ...baseModo, modoSeleccion: true })).toBe(false);
  });

  it("ver todo fuerza la grilla completa", () => {
    expect(esModoPortada({ ...baseModo, verTodo: true })).toBe(false);
  });
});

describe("recienLlegados", () => {
  it("ordena del más nuevo al más viejo", () => {
    const productos = [
      producto({ id: "viejo", creado_en: "2026-01-01T00:00:00Z" }),
      producto({ id: "nuevo", creado_en: "2026-08-01T00:00:00Z" }),
      producto({ id: "medio", creado_en: "2026-05-01T00:00:00Z" }),
    ];
    expect(recienLlegados(productos).map((p) => p.id)).toEqual([
      "nuevo",
      "medio",
      "viejo",
    ]);
  });

  it("los que no tienen fecha van al final, no arriba", () => {
    const productos = [
      producto({ id: "sin-fecha", creado_en: undefined }),
      producto({ id: "con-fecha", creado_en: "2026-01-01T00:00:00Z" }),
    ];
    expect(recienLlegados(productos).map((p) => p.id)).toEqual([
      "con-fecha",
      "sin-fecha",
    ]);
  });

  it("recorta al límite pedido", () => {
    const productos = Array.from({ length: 20 }, (_, i) =>
      producto({ id: String(i), creado_en: "2026-01-01T00:00:00Z" }),
    );
    expect(recienLlegados(productos, 5)).toHaveLength(5);
  });

  it("no muta el array recibido", () => {
    const productos = [
      producto({ id: "a", creado_en: "2026-01-01T00:00:00Z" }),
      producto({ id: "b", creado_en: "2026-08-01T00:00:00Z" }),
    ];
    recienLlegados(productos);
    expect(productos.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("imagenDePortada", () => {
  it("prefiere el grid sobre el thumbnail y el main", () => {
    expect(
      imagenDePortada(
        producto({
          grid_url: '["g.webp"]',
          thumbnail_url: '["t.webp"]',
          imagen_url: '["m.webp"]',
        }),
      ),
    ).toBe("g.webp");
  });

  it("cae al main si no hay versiones chicas", () => {
    expect(imagenDePortada(producto({ imagen_url: '["m.webp"]' }))).toBe(
      "m.webp",
    );
  });

  it("devuelve null sin imágenes", () => {
    expect(imagenDePortada(producto({}))).toBeNull();
  });
});

describe("construirPortadaCategorias", () => {
  const productos = [
    producto({ id: "1", categoria_id: "hijo-a", grid_url: '["a.webp"]' }),
    producto({ id: "2", categoria_id: "suelta", grid_url: '["s.webp"]' }),
  ];
  const resolver = (p: Producto) => p.categoria_id ?? "sin-categoria";

  it("un padre toma la imagen de su rama", () => {
    const [padre] = construirPortadaCategorias({
      entradas: [
        { id: "padre", nombre: "Ropa", count: 3, idsRama: ["padre", "hijo-a"] },
      ],
      productos,
      resolverCategoriaId: resolver,
    });
    expect(padre.imagen).toBe("a.webp");
  });

  it("descarta categorías sin productos visibles", () => {
    const entradas = construirPortadaCategorias({
      entradas: [
        { id: "vacia", nombre: "Vacía", count: 0, idsRama: ["vacia"] },
        { id: "suelta", nombre: "Suelta", count: 1, idsRama: ["suelta"] },
      ],
      productos,
      resolverCategoriaId: resolver,
    });
    expect(entradas.map((e) => e.id)).toEqual(["suelta"]);
  });

  it("la portada configurada a mano gana sobre la deducida", () => {
    const [entrada] = construirPortadaCategorias({
      entradas: [
        {
          id: "suelta",
          nombre: "Suelta",
          count: 1,
          idsRama: ["suelta"],
          imagenConfigurada: "https://x/elegida.webp",
        },
      ],
      productos,
      resolverCategoriaId: resolver,
    });
    expect(entrada.imagen).toBe("https://x/elegida.webp");
  });

  it("una portada configurada vacía cae al fallback en vez de dejar hueco", () => {
    const [entrada] = construirPortadaCategorias({
      entradas: [
        {
          id: "suelta",
          nombre: "Suelta",
          count: 1,
          idsRama: ["suelta"],
          imagenConfigurada: "   ",
        },
      ],
      productos,
      resolverCategoriaId: resolver,
    });
    expect(entrada.imagen).toBe("s.webp");
  });

  it("una categoría sin ninguna imagen queda en null, no rompe", () => {
    const [entrada] = construirPortadaCategorias({
      entradas: [{ id: "x", nombre: "X", count: 2, idsRama: ["x"] }],
      productos,
      resolverCategoriaId: resolver,
    });
    expect(entrada.imagen).toBeNull();
  });
});

describe("destacados", () => {
  it("ordena del último marcado al primero", () => {
    const productos = [
      producto({ id: "viejo", destacado_en: "2026-08-01T00:00:00Z" }),
      producto({ id: "nuevo", destacado_en: "2026-08-30T00:00:00Z" }),
      producto({ id: "medio", destacado_en: "2026-08-15T00:00:00Z" }),
    ];
    expect(destacados(productos).map((p) => p.id)).toEqual([
      "nuevo",
      "medio",
      "viejo",
    ]);
  });

  it("ignora los que no están marcados", () => {
    const productos = [
      producto({ id: "sin-marca" }),
      producto({ id: "marcado", destacado_en: "2026-08-01T00:00:00Z" }),
      producto({ id: "nulo", destacado_en: null }),
    ];
    expect(destacados(productos).map((p) => p.id)).toEqual(["marcado"]);
  });

  it("recorta al tope aunque haya más marcados de la cuenta", () => {
    const productos = Array.from({ length: 12 }, (_, i) =>
      producto({ id: String(i), destacado_en: `2026-08-${10 + i}T00:00:00Z` }),
    );
    expect(destacados(productos)).toHaveLength(MAX_DESTACADOS);
  });

  it("no muta el array recibido", () => {
    const productos = [
      producto({ id: "a", destacado_en: "2026-08-01T00:00:00Z" }),
      producto({ id: "b", destacado_en: "2026-08-30T00:00:00Z" }),
    ];
    destacados(productos);
    expect(productos.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("seleccionPortada", () => {
  it("los destacados ganan sobre los recién llegados", () => {
    const productos = [
      producto({ id: "nuevo-sin-foto", creado_en: "2026-08-30T00:00:00Z" }),
      producto({
        id: "elegido",
        creado_en: "2026-01-01T00:00:00Z",
        destacado_en: "2026-08-20T00:00:00Z",
      }),
    ];
    const fila = seleccionPortada(productos);
    expect(fila.origen).toBe("destacados");
    expect(fila.productos.map((p) => p.id)).toEqual(["elegido"]);
  });

  it("sin ningún destacado cae a recién llegados, como siempre", () => {
    const productos = [
      producto({ id: "viejo", creado_en: "2026-01-01T00:00:00Z" }),
      producto({ id: "nuevo", creado_en: "2026-08-30T00:00:00Z" }),
    ];
    const fila = seleccionPortada(productos);
    expect(fila.origen).toBe("recientes");
    expect(fila.productos.map((p) => p.id)).toEqual(["nuevo", "viejo"]);
  });

  it("un destacado que no llega filtrado no se cuela: la marca no es permiso", () => {
    // `seleccionPortada` recibe los YA visibles. Si el destacado se despublicó
    // no está en la lista, y la portada tiene que caer a recién llegados en vez
    // de quedar vacía.
    const visibles = [producto({ id: "otro", creado_en: "2026-08-30T00:00:00Z" })];
    const fila = seleccionPortada(visibles);
    expect(fila.origen).toBe("recientes");
    expect(fila.productos.map((p) => p.id)).toEqual(["otro"]);
  });
});

describe("destacados: empate de timestamp", () => {
  // Destacar 8 de una es un solo UPDATE con un solo timestamp, así que el
  // empate no es un caso raro: es EL caso. Verificado en producción — las 8
  // filas de Estilo Bonito tienen `2026-09-01 02:28:52.832+00` exacto.
  const MISMO = "2026-09-01T02:28:52.832Z";

  it("conserva los 8 y no pierde ninguno", () => {
    const productos = Array.from({ length: 8 }, (_, i) =>
      producto({ id: `p${i}`, destacado_en: MISMO }),
    );
    const salida = destacados(productos);
    expect(salida).toHaveLength(8);
    expect(new Set(salida.map((p) => p.id)).size).toBe(8);
  });

  it("con empate respeta el orden de entrada (sort estable)", () => {
    const productos = [
      producto({ id: "nuevo", creado_en: "2026-08-30T00:00:00Z", destacado_en: MISMO }),
      producto({ id: "medio", creado_en: "2026-05-01T00:00:00Z", destacado_en: MISMO }),
      producto({ id: "viejo", creado_en: "2026-01-01T00:00:00Z", destacado_en: MISMO }),
    ];
    expect(destacados(productos).map((p) => p.id)).toEqual([
      "nuevo",
      "medio",
      "viejo",
    ]);
  });

  it("el server y el navegador ordenan igual sobre la misma entrada", () => {
    // `calcularPortada` (server) y `seleccionPortada` (cliente) corren esto por
    // separado sobre listas que llegan en el mismo orden. Si el resultado no
    // coincidiera, la portada se reacomodaría sola al hidratar.
    const productos = Array.from({ length: 8 }, (_, i) =>
      producto({ id: `p${i}`, destacado_en: MISMO }),
    );
    const server = destacados(productos).map((p) => p.id);
    const cliente = destacados([...productos]).map((p) => p.id);
    expect(cliente).toEqual(server);
  });

  it("un timestamp distinto sigue ganando sobre los empatados", () => {
    const productos = [
      producto({ id: "empatado-a", destacado_en: MISMO }),
      producto({ id: "posterior", destacado_en: "2026-09-01T10:00:00.000Z" }),
      producto({ id: "empatado-b", destacado_en: MISMO }),
    ];
    expect(destacados(productos).map((p) => p.id)).toEqual([
      "posterior",
      "empatado-a",
      "empatado-b",
    ]);
  });
});
