import { afterEach, describe, expect, it, vi } from "vitest";
import { traerTodo, TAMANO_PAGINA } from "./traer-todo";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fábrica de páginas sobre un dataset falso, como respondería PostgREST. */
const fuente = (filas: number[], opciones: { conCount?: boolean } = {}) => {
  const llamadas: Array<[number, number]> = [];

  const pagina = async (desde: number, hasta: number) => {
    llamadas.push([desde, hasta]);
    return {
      data: filas.slice(desde, hasta + 1),
      error: null,
      // PostgREST solo manda el total si se pidió `count: exact`.
      ...(opciones.conCount ? { count: filas.length } : {}),
    };
  };

  return { pagina, llamadas };
};

const rango = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("traerTodo", () => {
  it("una sola página cuando entra todo", async () => {
    const { pagina, llamadas } = fuente(rango(42), { conCount: true });
    const r = await traerTodo("chico", pagina);

    expect(r.data).toHaveLength(42);
    expect(r.error).toBeNull();
    // No pide una segunda página al pedo: la primera vino incompleta.
    expect(llamadas).toHaveLength(1);
  });

  it("trae TODO cuando hay más que el tope, que era el bug", async () => {
    // 1.116 = los publicados de Evens el día que se descubrió esto. Sin
    // paginar se servían 1.000 y los 116 más viejos no existían para nadie.
    const { pagina, llamadas } = fuente(rango(1116), { conCount: true });
    const r = await traerTodo("evens", pagina);

    expect(r.data).toHaveLength(1116);
    expect(r.total).toBe(1116);
    expect(llamadas).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("no duplica ni saltea filas en el borde entre páginas", async () => {
    const { pagina } = fuente(rango(2500), { conCount: true });
    const r = await traerTodo("bordes", pagina);

    expect(r.data).toEqual(rango(2500));
    expect(new Set(r.data).size).toBe(2500);
  });

  it("un múltiplo exacto del tope no pierde la última página", async () => {
    const { pagina, llamadas } = fuente(rango(2000), { conCount: true });
    const r = await traerTodo("exacto", pagina);

    expect(r.data).toHaveLength(2000);
    expect(llamadas).toHaveLength(2);
  });

  it("sin count cae al bucle secuencial y trae todo igual", async () => {
    const { pagina, llamadas } = fuente(rango(2300));
    const r = await traerTodo("sin count", pagina);

    expect(r.data).toHaveLength(2300);
    expect(llamadas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("un error en la primera página no devuelve datos a medias", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await traerTodo("falla", async () => ({
      data: null,
      error: { message: "boom" },
    }));

    expect(r.data).toEqual([]);
    expect(r.error).toBe("boom");
  });

  it("un error en una página POSTERIOR tampoco devuelve media lista", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const filas = rango(2500);

    const r = await traerTodo("falla tarde", async (desde, hasta) => {
      if (desde > 0) return { data: null, error: { message: "cayó" } };
      return { data: filas.slice(desde, hasta + 1), error: null, count: 2500 };
    });

    // Media lista es peor que ninguna: con un catálogo incompleto el
    // importador crea duplicados y el POS no encuentra qué vender.
    expect(r.data).toEqual([]);
    expect(r.error).toBe("cayó");
  });

  it("el tope de páginas corta y lo deja logueado, no cuelga", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // 40 páginas pedidas contra un tope de 30.
    const { pagina } = fuente(rango(40 * TAMANO_PAGINA), { conCount: true });
    const r = await traerTodo("gigante", pagina);

    expect(r.data).toHaveLength(30 * TAMANO_PAGINA);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("superan el tope de 30 páginas"),
    );
  });
});
