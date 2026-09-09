import { describe, expect, it } from "vitest";
import { describirRenglon, mensajeSinStock } from "./mensaje-sin-stock";

describe("el caso que motivó esto", () => {
  it("nombra el producto, no solo el talle", () => {
    // Antes decía: Sin stock suficiente para la variante "40".
    // Con tres renglones en el ticket, "40" no dice cuál de los tres.
    expect(
      mensajeSinStock([{ producto: "Campera Corderito", variante: "40" }]),
    ).toBe('Sin stock de "Campera Corderito" (40).');
  });

  it("enumera varios como se enumera hablando", () => {
    expect(
      mensajeSinStock([
        { producto: "Campera Corderito", variante: "40" },
        { producto: "Remera lisa", variante: "M" },
        { producto: "Jean recto", variante: "42" },
      ]),
    ).toBe(
      'Sin stock de "Campera Corderito" (40), "Remera lisa" (M) y "Jean recto" (42).',
    );
  });
});

describe("describirRenglon", () => {
  it("con talle y color, los muestra tal como están cargados", () => {
    expect(
      describirRenglon({
        producto: "campera estampada corderito",
        variante: "TALLE: 10 / COLOR: estampado",
      }),
    ).toBe('"campera estampada corderito" (TALLE: 10 / COLOR: estampado)');
  });

  it("no repite el nombre cuando la variante es el mismo texto", () => {
    // Pasa en productos sin variantes reales: el nombre_display repite el del
    // producto, y «"X" (X)» se lee como un error del sistema.
    expect(
      describirRenglon({ producto: "Alfajor", variante: "alfajor" }),
    ).toBe('"Alfajor"');
  });

  it("sin variante, solo el producto", () => {
    expect(describirRenglon({ producto: "Alfajor", variante: "" })).toBe(
      '"Alfajor"',
    );
    expect(describirRenglon({ producto: "Alfajor" })).toBe('"Alfajor"');
  });

  it("sin producto cae a la variante, que es lo que se decía antes", () => {
    // Un carrito viejo puede no traer el nombre. Degradar al comportamiento
    // anterior es mejor que no decir nada.
    expect(describirRenglon({ variante: "40" })).toBe('"40"');
  });

  it("ignora los espacios de más", () => {
    expect(
      describirRenglon({ producto: "  Campera  ", variante: "  40 " }),
    ).toBe('"Campera" (40)');
  });
});

describe("bordes", () => {
  it("sin renglones identificables, el mensaje genérico de siempre", () => {
    // Preferible decir poco a nombrar mal el producto que hay que ir a buscar.
    expect(mensajeSinStock([])).toBe(
      "Sin stock suficiente para completar la venta.",
    );
    expect(mensajeSinStock([{ producto: "", variante: "" }])).toBe(
      "Sin stock suficiente para completar la venta.",
    );
  });

  it("descarta los vacíos y nombra los que sí puede", () => {
    expect(
      mensajeSinStock([
        { producto: null, variante: null },
        { producto: "Campera Corderito", variante: "40" },
      ]),
    ).toBe('Sin stock de "Campera Corderito" (40).');
  });
});
