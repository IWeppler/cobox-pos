import { describe, expect, it } from "vitest";
import { precioMostrable } from "./precio-efectivo-producto";

describe("el caso que motivó esto", () => {
  it("uniforme NO quiere decir igual al producto", () => {
    // Pantalon sastrero HHP, Evens, 8/9/2026: cabecera $52.000, las 7
    // variantes en $20.000. El listado mostraba $52.000 y la caja cobraba
    // $20.000. Uniforme entre ellas, distinto del producto.
    const r = precioMostrable(52000, Array(7).fill(20000));

    expect(r.valor).toBe(20000);
    expect(r.uniforme).toBe(true);
    expect(r.difiereDeCabecera).toBe(true);
  });

  it("una sola variante con precio propio también cuenta", () => {
    // BLUSA NOURA 680: 2 variantes, una con $28.000 propio y otra heredando
    // $26.000. Antes el rango solo se calculaba con más de una variante.
    const r = precioMostrable(26000, [28000, null]);

    expect(r.min).toBe(26000);
    expect(r.max).toBe(28000);
    expect(r.uniforme).toBe(false);
    expect(r.difiereDeCabecera).toBe(true);
  });
});

describe("el caso normal, que es el 98% del catálogo", () => {
  it("todas heredan: manda la cabecera y no hay nada que avisar", () => {
    const r = precioMostrable(30000, [null, null, null]);

    expect(r.valor).toBe(30000);
    expect(r.uniforme).toBe(true);
    expect(r.difiereDeCabecera).toBe(false);
  });

  it("producto sin variantes", () => {
    const r = precioMostrable(15000, []);

    expect(r.valor).toBe(15000);
    expect(r.uniforme).toBe(true);
    expect(r.difiereDeCabecera).toBe(false);
  });

  it("una copia exacta se comporta igual que heredar", () => {
    // Es lo que dejó 20260908200000 al nulearlas, pero si aparece una copia
    // nueva por algún camino, mostrarla no puede cambiar nada.
    expect(precioMostrable(30000, [30000, null]).difiereDeCabecera).toBe(false);
  });
});

describe("rangos", () => {
  it("con precios distintos devuelve los dos extremos y avisa", () => {
    // Maní con Sal, Kiosco Demo: tres pesos del mismo producto. Es legítimo,
    // y por eso se muestra el rango en vez de elegir uno.
    const r = precioMostrable(1800, [1800, 3900, 7200]);

    expect(r.min).toBe(1800);
    expect(r.max).toBe(7200);
    expect(r.uniforme).toBe(false);
    expect(r.difiereDeCabecera).toBe(true);
  });

  it("nunca promedia", () => {
    const r = precioMostrable(0, [10000, 20000]);

    expect([r.min, r.max]).toEqual([10000, 20000]);
    expect(r.valor).not.toBe(15000);
  });
});

describe("valores sucios", () => {
  it("la cadena vacía es heredar, no cero", () => {
    // PostgREST puede devolver "" en una columna numérica vacía, y tratarlo
    // como 0 mostraría un producto a $0 que en realidad se vende al precio
    // del padre.
    expect(precioMostrable(9000, ["", null]).valor).toBe(9000);
  });

  it("acepta números como texto", () => {
    expect(precioMostrable("52000", ["20000"]).valor).toBe(20000);
  });

  it("un cero PROPIO sí es cero", () => {
    // Distinto de null: alguien puso 0 a mano y hay que mostrarlo, porque es
    // justo el dato que la dueña tiene que ver para corregirlo.
    const r = precioMostrable(9000, [0, null]);

    expect(r.min).toBe(0);
    expect(r.max).toBe(9000);
    expect(r.uniforme).toBe(false);
  });
});
