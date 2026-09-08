import { describe, expect, it } from "vitest";
import { precioAlAsociar } from "./precio-al-asociar";

describe("precio al asociar una fila del remito a un producto existente", () => {
  it("con costo nuevo mantiene el margen que el producto ya tenía", () => {
    // El caso de Evelyn: entra mercadería más cara y el precio tiene que
    // acompañar. Antes quedaba el precio viejo y el margen se comía solo.
    const r = precioAlAsociar({
      costoRemito: 7000,
      costoActualProducto: 6000,
      precioActualProducto: 12000,
    });

    expect(r.precio).toBe(14000);
    expect(r.origen).toBe("markup");
    expect(r.costoCambio).toBe(true);
    expect(r.explicacion).toContain("$6.000");
    expect(r.explicacion).toContain("$7.000");
  });

  it("conserva un margen que no es el del comercio", () => {
    // Zapatillas de Evens: $22.500 de costo y $25.000 de precio, markup 1,11 a
    // propósito. Subir el costo no puede convertirlas en ×2.
    const r = precioAlAsociar({
      costoRemito: 25000,
      costoActualProducto: 22500,
      precioActualProducto: 25000,
    });

    expect(r.precio).toBe(27778);
    expect(r.markupAnterior).toBeCloseTo(1.11, 2);
    expect(r.markupNuevo).toBeCloseTo(1.11, 2);
  });

  it("si el costo no cambió, el precio tampoco", () => {
    const r = precioAlAsociar({
      costoRemito: 6000,
      costoActualProducto: 6000,
      precioActualProducto: 12000,
    });

    expect(r.precio).toBe(12000);
    expect(r.costoCambio).toBe(false);
    expect(r.explicacion).toContain("Mismo costo");
  });

  it("el precio del proveedor gana sobre el margen calculado", () => {
    const r = precioAlAsociar({
      costoRemito: 7000,
      precioSugeridoRemito: 15900,
      costoActualProducto: 6000,
      precioActualProducto: 12000,
    });

    expect(r.precio).toBe(15900);
    expect(r.origen).toBe("remito");
  });

  it("lo que la persona puso en la fila gana sobre todo", () => {
    const r = precioAlAsociar({
      costoRemito: 7000,
      precioEnLaFila: 13500,
      precioSugeridoRemito: 15900,
      costoActualProducto: 6000,
      precioActualProducto: 12000,
    });

    expect(r.precio).toBe(13500);
    expect(r.origen).toBe("edicion");
  });

  it("sin costo cargado en el producto, propone el doble del costo", () => {
    // 93,1% de los productos de Evens y 94,4% de los de Estilo Bonito están a
    // exactamente el doble: no es una adivinanza, es la regla del comercio.
    const r = precioAlAsociar({
      costoRemito: 5000,
      costoActualProducto: 0,
      precioActualProducto: 9000,
    });

    expect(r.precio).toBe(10000);
    expect(r.origen).toBe("doble-costo");
  });

  it("sin costo en el remito no inventa nada: queda el precio actual", () => {
    const r = precioAlAsociar({
      costoRemito: 0,
      costoActualProducto: 6000,
      precioActualProducto: 12000,
    });

    expect(r.precio).toBe(12000);
    expect(r.origen).toBe("sin-cambio");
    expect(r.costoCambio).toBe(false);
  });

  it("un producto nuevo sin datos previos no rompe", () => {
    const r = precioAlAsociar({ costoRemito: 3000 });

    expect(r.precio).toBe(6000);
    expect(r.markupAnterior).toBeNull();
    expect(r.markupNuevo).toBe(2);
  });
});
