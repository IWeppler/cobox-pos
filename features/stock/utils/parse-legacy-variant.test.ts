import { describe, expect, it } from "vitest";
import { isSingleVariantProduct } from "./parse-legacy-variant";
import type { Producto } from "@/entities/productos/types";

/**
 * El nombre de la variante placeholder se escribe distinto según por dónde
 * entró el producto — "Único" desde el alta manual, "Unico" desde remitos y
 * carga rápida — y las dos formas conviven en producción. Si el detector
 * reconoce solo una, el formulario de edición abre la sección de variantes
 * para productos que no tienen ninguna.
 */
const productoCon = (nombreDisplay: string): Producto =>
  ({
    id: "p1",
    nombre: "AUTO CONTROL REMOTO",
    producto_variantes: [
      { id: "v1", nombre_display: nombreDisplay, stock: 3 },
    ],
  }) as unknown as Producto;

describe("isSingleVariantProduct", () => {
  it("reconoce el placeholder del alta manual", () => {
    expect(isSingleVariantProduct(productoCon("Único"))).toBe(true);
  });

  it("reconoce el placeholder de remitos y carga rápida (sin tilde)", () => {
    expect(isSingleVariantProduct(productoCon("Unico"))).toBe(true);
  });

  it("tolera mayúsculas, espacios y el mojibake viejo", () => {
    expect(isSingleVariantProduct(productoCon("UNICO"))).toBe(true);
    expect(isSingleVariantProduct(productoCon(" Único "))).toBe(true);
    expect(isSingleVariantProduct(productoCon("Ãšnico"))).toBe(true);
  });

  it("un producto con variantes reales NO es simple", () => {
    expect(isSingleVariantProduct(productoCon("Talle L"))).toBe(false);

    const conDos = {
      id: "p2",
      producto_variantes: [
        { id: "v1", nombre_display: "Talle M", stock: 1 },
        { id: "v2", nombre_display: "Talle L", stock: 2 },
      ],
    } as unknown as Producto;
    expect(isSingleVariantProduct(conDos)).toBe(false);
  });

  it("cae al espejo legacy productos_stock cuando no hay producto_variantes", () => {
    const legacy = {
      id: "p3",
      stock: [{ variante: "Unico", cantidad: 5 }],
    } as unknown as Producto;

    expect(isSingleVariantProduct(legacy)).toBe(true);
  });
});
