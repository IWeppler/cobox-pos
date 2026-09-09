import { describe, expect, it } from "vitest";
import {
  restaurarCampo,
  snapshotCampo,
  vaciarCampo,
} from "./precio-en-todas-las-variantes";
import { precioMostrable } from "./precio-efectivo-producto";

type Fila = { stock: string; precio: string; precio_costo: string; sku: string };

const fila = (precio: string): Fila => ({
  stock: "1",
  precio,
  precio_costo: "",
  sku: "",
});

describe("la regla: se vacía, no se copia", () => {
  it("deja a todas heredando, sin escribirles el número", () => {
    const datos = { a: fila("20000"), b: fila("20000"), c: fila("") };

    const despues = vaciarCampo(datos, "precio");

    expect(Object.values(despues).map((f) => f.precio)).toEqual(["", "", ""]);
  });

  it("y con eso el producto pasa a tener UN precio", () => {
    // El caso de "Pantalon sastrero HHP": cabecera $52.000, 7 variantes en
    // $20.000. Después de vaciar, la cabecera manda y deja de haber dos
    // precios. Copiarle 52.000 a cada variante daría el mismo número HOY, pero
    // volvería a partirse en el próximo cambio de precio.
    const datos = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [`v${i}`, fila("20000")]),
    );

    const antes = precioMostrable(
      52000,
      Object.values(datos).map((f) => f.precio),
    );
    expect(antes.valor).toBe(20000);
    expect(antes.difiereDeCabecera).toBe(true);

    const despues = precioMostrable(
      52000,
      Object.values(vaciarCampo(datos, "precio")).map((f) => f.precio),
    );
    expect(despues.valor).toBe(52000);
    expect(despues.difiereDeCabecera).toBe(false);
  });

  it("no toca las otras columnas", () => {
    const datos = { a: { ...fila("20000"), precio_costo: "9000", sku: "X1" } };

    const despues = vaciarCampo(datos, "precio");

    expect(despues.a.precio_costo).toBe("9000");
    expect(despues.a.sku).toBe("X1");
    expect(despues.a.stock).toBe("1");
  });
});

describe("deshacer", () => {
  it("devuelve exactamente lo que había, incluido el vacío", () => {
    const datos = { a: fila("20000"), b: fila("") };
    const previos = snapshotCampo(
      [
        { key: "a", precio: "20000" },
        { key: "b", precio: "" },
      ],
      "precio",
    );

    const despues = restaurarCampo(vaciarCampo(datos, "precio"), "precio", previos);

    expect(despues.a.precio).toBe("20000");
    expect(despues.b.precio).toBe("");
  });

  it("no resucita una variante que ya no está", () => {
    // Entre aplicar y deshacer se puede destildar una combinación. Restaurarle
    // el precio la devolvería al payload que se guarda.
    const previos = { a: "20000", borrada: "31000" };

    const despues = restaurarCampo({ a: fila("") }, "precio", previos);

    expect(Object.keys(despues)).toEqual(["a"]);
    expect(despues.a.precio).toBe("20000");
  });

  it("el snapshot trata null y undefined como vacío", () => {
    const previos = snapshotCampo(
      [
        { key: "a", precio: null },
        { key: "b", precio: undefined },
        { key: "c", precio: 15000 },
      ],
      "precio",
    );

    expect(previos).toEqual({ a: "", b: "", c: "15000" });
  });
});
