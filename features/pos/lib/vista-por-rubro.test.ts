import { describe, expect, it } from "vitest";
import { posSinImagenes } from "./vista-por-rubro";

describe("posSinImagenes", () => {
  it("kiosco y almacén venden en modo lista", () => {
    // El producto se identifica por su nombre completo y la venta es de muchos
    // ítems chicos: lo escaso es cuántos entran en pantalla.
    expect(posSinImagenes("quioscos")).toBe(true);
    expect(posSinImagenes("alimentos")).toBe(true);
  });

  it("indumentaria conserva las fotos", () => {
    // Acá la foto ES el dato que distingue una prenda de otra: sacarla haría
    // la venta más lenta, no más rápida.
    expect(posSinImagenes("indumentaria")).toBe(false);
  });

  it("electro y los rubros sin definir también las conservan", () => {
    // Fail-open: esconder información por las dudas es peor que una foto de
    // más.
    expect(posSinImagenes("electro")).toBe(false);
    expect(posSinImagenes("otros")).toBe(false);
  });

  it("farmacia y ferretería también van en lista", () => {
    // Un remedio se pide por nombre y presentación, un tornillo por medida:
    // la foto de un tornillo de 3/8 es igual a la de uno de 1/2, así que
    // ocupa el lugar del texto que sí distingue.
    expect(posSinImagenes("farmacia")).toBe(true);
    expect(posSinImagenes("ferreteria")).toBe(true);
  });
});
