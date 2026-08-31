import { describe, expect, it } from "vitest";
import { coincideConBusqueda } from "./coincide-busqueda";

const producto = (parcial: Parameters<typeof coincideConBusqueda>[0]) => parcial;

const conSku = (...skus: (string | null)[]) =>
  producto({
    nombre: "Producto",
    producto_variantes: skus.map((sku, i) => ({ id: String(i), sku })) as never,
  });

describe("coincideConBusqueda", () => {
  it("sin búsqueda entran todos", () => {
    // Es el estado inicial de la grilla, no un filtro que no matchea nada.
    expect(coincideConBusqueda(producto({ nombre: "Remera" }), "")).toBe(true);
    expect(coincideConBusqueda(producto({ nombre: "Remera" }), "   ")).toBe(true);
  });

  it("encuentra por nombre, marca y modelo", () => {
    const p = producto({
      nombre: "Yerba",
      marca: "La Merced",
      modelo: "X200",
    });
    expect(coincideConBusqueda(p, "yerba")).toBe(true);
    expect(coincideConBusqueda(p, "merced")).toBe(true);
    expect(coincideConBusqueda(p, "x200")).toBe(true);
    expect(coincideConBusqueda(p, "playstation")).toBe(false);
  });

  it("encuentra por el SKU de CUALQUIERA de sus variantes", () => {
    // Es lo que entra cuando alguien escanea un código de barras.
    const p = conSku("ABC-1", "ABC-2");
    expect(coincideConBusqueda(p, "ABC-2")).toBe(true);
  });

  it("el SKU no distingue mayúsculas", () => {
    // Los tres SKU en minúscula que hay cargados tienen que encontrarse igual
    // que los otros.
    expect(coincideConBusqueda(conSku("abc123"), "ABC123")).toBe(true);
    expect(coincideConBusqueda(conSku("ABC123"), "abc123")).toBe(true);
  });

  it("una variante sin SKU no rompe la búsqueda", () => {
    expect(coincideConBusqueda(conSku(null, "7791234567890"), "779123")).toBe(
      true,
    );
  });

  it("ignora los acentos: nadie los escribe con la clienta esperando", () => {
    const p = producto({ nombre: "Camión de juguete" });
    expect(coincideConBusqueda(p, "camion")).toBe(true);
    expect(coincideConBusqueda(producto({ nombre: "Camion" }), "camión")).toBe(
      true,
    );
  });

  it("la ñ también se despoja: 'nina' encuentra 'Niña'", () => {
    // NFD parte la ñ en "n" + tilde, así que cae con los acentos. No es
    // correcto lingüísticamente y para buscar es lo que conviene: quien tipea
    // rápido no pone la ñ. El precio —que "año" y "ano" sean lo mismo— no
    // confunde a nadie en un catálogo de productos.
    expect(coincideConBusqueda(producto({ nombre: "Body Niña" }), "nina")).toBe(
      true,
    );
    expect(coincideConBusqueda(producto({ nombre: "Pañuelos" }), "panuelos")).toBe(
      true,
    );
  });

  it("un producto sin variantes ni marca no explota", () => {
    expect(coincideConBusqueda(producto({ nombre: "Suelto" }), "xyz")).toBe(
      false,
    );
  });
});
