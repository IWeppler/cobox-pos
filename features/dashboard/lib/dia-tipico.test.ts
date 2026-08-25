import { describe, it, expect } from "vitest";
import { compararConDiaTipico, muestraDeTickets } from "./dia-tipico";
import type { Venta } from "@/entities/ventas/types";

// Martes 2026-08-25, 13:00 — el 33% del día ya pasó, el 55% entra entre las
// 17 y las 20.
const MARTES_13 = new Date(2026, 7, 25, 13, 0, 0);

function venta(fecha: string, total: number, costo = 0, cantidad = 1): Venta {
  return {
    id: crypto.randomUUID(),
    total,
    precio_costo: costo,
    cantidad,
    fecha_venta: fecha,
  } as Venta;
}

describe("compararConDiaTipico", () => {
  it("toma como referencia los mismos días de la semana, no los días anteriores", () => {
    const r = compararConDiaTipico(
      [
        venta("2026-08-25T10:00:00", 100), // hoy, martes
        venta("2026-08-18T10:00:00", 200), // martes pasado
        venta("2026-08-11T10:00:00", 400), // martes anterior
        venta("2026-08-24T10:00:00", 999), // ayer, LUNES: no es referencia
      ],
      MARTES_13,
    );

    expect(r.dias).toBe(2);
    expect(r.hoy.ingresos).toBe(100);
    expect(r.tipico.ingresos).toBe(300); // (200 + 400) / 2, sin el lunes
  });

  it("corta los días de referencia a la MISMA hora", () => {
    // Es el error que arregla: comparar el día en curso contra días completos
    // mostraba una caída enorme toda la mañana.
    const r = compararConDiaTipico(
      [
        venta("2026-08-25T10:00:00", 100), // hoy a las 10
        venta("2026-08-18T10:00:00", 100), // martes pasado a las 10
        venta("2026-08-18T19:00:00", 900), // …y a las 19, que hoy no pasó aún
      ],
      MARTES_13,
    );

    expect(r.tipico.ingresos).toBe(100); // no 1000
    expect(r.hoy.ingresos).toBe(100);
  });

  it("un día que abrió y no vendió antes del corte cuenta como cero, no se saltea", () => {
    // Si se filtraran los días sin ventas tempranas, los martes de arranque
    // lento quedarían afuera y el promedio saldría inflado.
    const r = compararConDiaTipico(
      [
        venta("2026-08-25T10:00:00", 100),
        venta("2026-08-18T19:00:00", 600), // abrió, pero vendió recién a la tarde
        venta("2026-08-11T10:00:00", 200),
      ],
      MARTES_13,
    );

    expect(r.dias).toBe(2);
    expect(r.tipico.ingresos).toBe(100); // (0 + 200) / 2
  });

  it("un día cerrado no entra como referencia", () => {
    const r = compararConDiaTipico(
      [venta("2026-08-25T10:00:00", 100), venta("2026-08-11T10:00:00", 200)],
      MARTES_13,
    );
    // El martes 18 no tiene ninguna venta: no abrió, no es un día típico.
    expect(r.dias).toBe(1);
    expect(r.tipico.ingresos).toBe(200);
  });

  it("los ingresos van sin recargo y la ganancia resta el costo", () => {
    const conRecargo = {
      ...venta("2026-08-25T10:00:00", 115, 50),
      recargo_metodo_total: 15,
    } as Venta;
    const r = compararConDiaTipico([conRecargo], MARTES_13);

    expect(r.hoy.ingresos).toBe(100); // 115 − 15 de recargo
    expect(r.hoy.ganancia).toBe(50); // 100 − 50 de costo
  });

  it("sin días de referencia devuelve dias en 0 y promedios en 0", () => {
    const r = compararConDiaTipico([venta("2026-08-25T10:00:00", 100)], MARTES_13);
    expect(r.dias).toBe(0);
    expect(r.tipico.ingresos).toBe(0);
  });

  it("junta los tickets de referencia para poder medir el ruido del promedio", () => {
    const r = compararConDiaTipico(
      [
        venta("2026-08-25T10:00:00", 100),
        venta("2026-08-18T10:00:00", 200),
        venta("2026-08-18T11:00:00", 300),
        venta("2026-08-11T10:00:00", 400),
      ],
      MARTES_13,
    );
    expect(r.hoy.tickets).toEqual([100]);
    expect(r.ticketsReferencia.sort((a, b) => a - b)).toEqual([200, 300, 400]);
  });

  it("respeta el límite de semanas hacia atrás", () => {
    const r = compararConDiaTipico(
      [
        venta("2026-08-25T10:00:00", 100),
        venta("2026-08-18T10:00:00", 200), // 1 semana
        venta("2026-08-04T10:00:00", 999), // 3 semanas: fuera del límite
      ],
      MARTES_13,
      2,
    );
    expect(r.dias).toBe(1);
    expect(r.tipico.ingresos).toBe(200);
  });
});

describe("muestraDeTickets", () => {
  it("calcula media, desvío muestral y n", () => {
    const m = muestraDeTickets([10, 20, 30]);
    expect(m.n).toBe(3);
    expect(m.media).toBe(20);
    expect(m.desvio).toBe(10);
  });

  it("con un solo ticket el desvío es 0 (no hay dispersión estimable)", () => {
    expect(muestraDeTickets([50])).toEqual({ media: 50, desvio: 0, n: 1 });
  });

  it("sin tickets devuelve n en 0", () => {
    expect(muestraDeTickets([])).toEqual({ media: 0, desvio: 0, n: 0 });
  });
});
