import { describe, expect, it } from "vitest";
import type { Producto } from "@/entities/productos/types";
import { etiquetaCortaDeVariante, resumirStock } from "./resumen-stock";

const variante = (
  nombre_display: string,
  stock: number,
  extra: Record<string, unknown> = {},
) =>
  ({
    id: nombre_display,
    nombre_display,
    precio: null,
    stock,
    ...extra,
  }) as never;

const producto = (parcial: Partial<Producto>): Producto =>
  ({ id: "p1", nombre: "Remera", precio: 1000, ...parcial }) as Producto;

describe("resumirStock", () => {
  it("suma el stock de todas las variantes", () => {
    const resumen = resumirStock(
      producto({
        producto_variantes: [variante("S", 2), variante("M", 3)],
      }),
    );
    expect(resumen.total).toBe(5);
    expect(resumen.tieneVariantes).toBe(true);
  });

  it("descuenta las reservas cuando la consulta las trajo", () => {
    // `stock_disponible` es el stock físico neto de reservas ACTIVAS. Si se
    // ignorara, la grilla ofrecería mercadería ya apartada para otra clienta.
    const resumen = resumirStock(
      producto({
        producto_variantes: [
          variante("S", 5, { stock_disponible: 1 }),
          variante("M", 2),
        ],
      }),
    );
    expect(resumen.total).toBe(3);
  });

  it("no desglosa el producto sin variantes reales", () => {
    // La fila "Único" no es una opción entre otras: mostrarla sería repetir el
    // total con otro nombre al lado.
    const resumen = resumirStock(
      producto({ producto_variantes: [variante("Único", 7)] }),
    );
    expect(resumen.total).toBe(7);
    expect(resumen.tieneVariantes).toBe(false);
    expect(resumen.variantes).toEqual([]);
  });

  it("cae al stock legacy cuando no hay producto_variantes", () => {
    const resumen = resumirStock(
      producto({ stock: [{ cantidad: 4 } as never, { cantidad: 2 } as never] }),
    );
    expect(resumen.total).toBe(6);
    expect(resumen.tieneVariantes).toBe(false);
  });

  it("muestra las de MÁS stock primero y cuenta el resto", () => {
    const resumen = resumirStock(
      producto({
        producto_variantes: [
          variante("S", 1),
          variante("M", 9),
          variante("L", 4),
          variante("XL", 2),
          variante("XXL", 3),
        ],
      }),
    );
    expect(resumen.variantes.map((v) => v.etiqueta)).toEqual(["M", "L", "XXL"]);
    expect(resumen.restantes).toBe(2);
  });

  it("deja afuera del desglose las variantes agotadas, pero no del total", () => {
    // Un talle en cero no es una opción para ofrecer; el total sí tiene que
    // seguir siendo el del producto.
    const resumen = resumirStock(
      producto({
        producto_variantes: [variante("S", 0), variante("M", 3)],
      }),
    );
    expect(resumen.total).toBe(3);
    expect(resumen.variantes).toEqual([{ etiqueta: "M", stock: 3 }]);
    expect(resumen.restantes).toBe(0);
  });
});

describe("resumirStock: etiquetas repetidas", () => {
  it("agrupa las variantes que comparten etiqueta", () => {
    // El primer atributo puede repetirse entre variantes: el mismo color en
    // dos talles. Mostrarlo dos veces no le dice nada a nadie en el mostrador
    // —y encima repetía la key de React, que era el error en consola.
    const resumen = resumirStock(
      producto({
        producto_variantes: [
          variante("COLOR: Estampado / TALLE: 1", 3, {
            atributos: { Color: "Estampado", Talle: "1" },
          }),
          variante("COLOR: Estampado / TALLE: 2", 2, {
            atributos: { Color: "Estampado", Talle: "2" },
          }),
          variante("COLOR: Liso / TALLE: 1", 1, {
            atributos: { Color: "Liso", Talle: "1" },
          }),
        ],
      }),
    );

    expect(resumen.total).toBe(6);
    expect(resumen.variantes).toEqual([
      { etiqueta: "Estampado", stock: 5 },
      { etiqueta: "Liso", stock: 1 },
    ]);
  });

  it("las etiquetas mostradas nunca se repiten: sirven de key en React", () => {
    const resumen = resumirStock(
      producto({
        producto_variantes: [
          variante("A", 1, { atributos: { Color: "Rojo" } }),
          variante("B", 2, { atributos: { Color: "Rojo" } }),
          variante("C", 3, { atributos: { Color: "Azul" } }),
          variante("D", 4, { atributos: { Color: "Verde" } }),
        ],
      }),
    );

    const etiquetas = resumen.variantes.map((v) => v.etiqueta);
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });
});

describe("etiquetaCortaDeVariante", () => {
  it("usa el primer atributo, que es el que ordena la elección", () => {
    expect(
      etiquetaCortaDeVariante({
        nombre_display: "TALLE: 4 / COLOR: rosa",
        atributos: { Talle: "4", Color: "rosa" },
      }),
    ).toBe("4");
  });

  it("sin atributos, recorta el primer segmento del nombre", () => {
    expect(
      etiquetaCortaDeVariante({ nombre_display: "TALLE: 4 / COLOR: rosa" }),
    ).toBe("4");
    expect(etiquetaCortaDeVariante({ nombre_display: "S / Rojo" })).toBe("S");
  });

  it("no devuelve vacío cuando no hay de dónde sacar nada", () => {
    expect(etiquetaCortaDeVariante({ nombre_display: "" })).toBe("");
  });
});
