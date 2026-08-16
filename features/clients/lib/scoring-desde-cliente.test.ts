import { describe, expect, it } from "vitest";
import {
  calcularReferencia,
  type ClienteParaScoring,
} from "./scoring-desde-cliente";

/**
 * `calcularReferencia` es la única puerta pública que expone el margen, así que
 * es por donde se puede fijar la semántica de `precio_costo`.
 *
 * El bug que estos tests impiden que vuelva: `ventas.precio_costo` es el costo
 * TOTAL de la venta (cada renglón ya entra multiplicado por su cantidad) y el
 * adaptador lo trataba como unitario, volviéndolo a multiplicar por
 * `ventas.cantidad`. Sobre las 226 ventas reales de más de un renglón daba
 * $25.386.500 de costo contra $6.323.000 real: el margen de los clientes que
 * más compran quedaba hundido, y con él su scoring de valor.
 */
describe("calcularReferencia — el margen sale del costo total", () => {
  const cliente = (venta: {
    total: number;
    precio_costo: number;
    cantidad: number;
  }): ClienteParaScoring => ({
    ventas: [{ ...venta, fecha_venta: "2026-08-01T12:00:00Z" }],
  });

  it("resta el costo una sola vez, sin importar cuántas unidades tenga el ticket", () => {
    const { margenMaximo } = calcularReferencia([
      cliente({ total: 36000, precio_costo: 9000, cantidad: 3 }),
    ]);

    expect(margenMaximo).toBe(27000);
  });

  it("no multiplica el costo por la cantidad", () => {
    // Con la cuenta vieja esto daba 36000 - 9000 * 3 = 9000.
    const { margenMaximo } = calcularReferencia([
      cliente({ total: 36000, precio_costo: 9000, cantidad: 3 }),
    ]);

    expect(margenMaximo).not.toBe(9000);
  });

  it("un ticket de una sola unidad da lo mismo que antes: ahí el bug no se veía", () => {
    const { margenMaximo } = calcularReferencia([
      cliente({ total: 12000, precio_costo: 4000, cantidad: 1 }),
    ]);

    expect(margenMaximo).toBe(8000);
  });

  it("cambiar solo las unidades no mueve el margen", () => {
    const pocas = calcularReferencia([
      cliente({ total: 50000, precio_costo: 20000, cantidad: 2 }),
    ]);
    const muchas = calcularReferencia([
      cliente({ total: 50000, precio_costo: 20000, cantidad: 40 }),
    ]);

    expect(pocas.margenMaximo).toBe(muchas.margenMaximo);
  });

  it("sin costo cargado el margen es el total, no un número negativo", () => {
    const { margenMaximo } = calcularReferencia([
      cliente({ total: 15000, precio_costo: 0, cantidad: 5 }),
    ]);

    expect(margenMaximo).toBe(15000);
  });

  it("un comercio donde todo se vendió bajo el costo tiene referencia 0, no negativa", () => {
    // Pasa de verdad: mercadería liquidada por debajo del costo. El margen de
    // esa venta es -3.000, pero la REFERENCIA (el techo contra el que se
    // compara al resto) arranca en 0 y no baja: una referencia negativa daría
    // proporciones invertidas al puntuar a los demás.
    const { margenMaximo } = calcularReferencia([
      cliente({ total: 5000, precio_costo: 8000, cantidad: 1 }),
    ]);

    expect(margenMaximo).toBe(0);
  });

  it("la referencia es el mejor cliente del comercio, no un absoluto", () => {
    const { margenMaximo, comprasMaximas } = calcularReferencia([
      cliente({ total: 10000, precio_costo: 3000, cantidad: 1 }),
      {
        ventas: [
          { total: 80000, precio_costo: 30000, fecha_venta: "2026-08-01" },
          { total: 20000, precio_costo: 5000, fecha_venta: "2026-08-02" },
        ],
      },
    ]);

    expect(margenMaximo).toBe(65000);
    expect(comprasMaximas).toBe(2);
  });
});
