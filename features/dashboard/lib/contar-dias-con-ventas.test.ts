import { describe, it, expect } from "vitest";
import { contarDiasConVentas } from "./contar-dias-con-ventas";
import { resolverRangoActual } from "@/shared/lib/periodo-ranges";
import type { Venta } from "@/entities/ventas/types";

const MIERCOLES = new Date(2026, 6, 22, 15, 0, 0); // miércoles 2026-07-22

function venta(fecha: string): Venta {
  return {
    id: crypto.randomUUID(),
    total: 1000,
    precio_costo: 0,
    cantidad: 1,
    fecha_venta: fecha,
  } as Venta;
}

describe("contarDiasConVentas", () => {
  it("cuenta días distintos, no ventas", () => {
    const rango = resolverRangoActual("semana", MIERCOLES);
    const dias = contarDiasConVentas(
      [
        venta("2026-07-20T10:00:00"),
        venta("2026-07-20T18:00:00"),
        venta("2026-07-22T11:00:00"),
      ],
      rango,
    );
    expect(dias).toBe(2); // lunes y miércoles; el martes no vendió
  });

  it("el caso real: el feriado sin ventas no cuenta como día abierto", () => {
    // Lunes 17/8/2026 (San Martín) no tiene una sola venta en Evens; el
    // martes 18 sí. El tramo son dos días de calendario y uno abierto.
    const rango = {
      inicio: new Date(2026, 7, 17),
      fin: new Date(2026, 7, 18, 23, 59, 59, 999),
    };
    expect(contarDiasConVentas([venta("2026-08-18T12:00:00")], rango)).toBe(1);
  });

  it("ignora ventas fuera del rango", () => {
    const rango = resolverRangoActual("semana", MIERCOLES);
    expect(contarDiasConVentas([venta("2026-06-01T10:00:00")], rango)).toBe(0);
  });

  it("sin ventas devuelve 0", () => {
    expect(
      contarDiasConVentas([], resolverRangoActual("semana", MIERCOLES)),
    ).toBe(0);
  });

  it("cuenta por día LOCAL: una venta de las 23:00 no cae en el día siguiente", () => {
    const rango = resolverRangoActual("semana", MIERCOLES);
    const dias = contarDiasConVentas(
      [venta("2026-07-20T23:30:00"), venta("2026-07-21T00:30:00")],
      rango,
    );
    expect(dias).toBe(2);
  });
});
