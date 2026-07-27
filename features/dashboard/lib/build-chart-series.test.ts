import { describe, it, expect } from "vitest";
import { construirSerieDiaria } from "./build-chart-series";
import type { Venta } from "@/entities/ventas/types";

const AHORA = new Date(2026, 6, 22, 15, 0, 0); // miércoles 2026-07-22

function venta(fecha: string, total: number, costo: number, cantidad: number): Venta {
  return {
    id: crypto.randomUUID(),
    total,
    precio_costo: costo,
    cantidad,
    fecha_venta: fecha,
  } as Venta;
}

describe("construirSerieDiaria", () => {
  it("devuelve exactamente `dias` puntos, uno por día, terminando en 'ahora'", () => {
    const serie = construirSerieDiaria([], 7, AHORA);
    expect(serie).toHaveLength(7);
    expect(serie[6].fecha).toBe("2026-07-22");
    expect(serie[0].fecha).toBe("2026-07-16");
  });

  it("días sin ventas quedan en 0, no se saltean", () => {
    const serie = construirSerieDiaria([], 3, AHORA);
    expect(serie.every((p) => p.ingresos === 0 && p.unidades === 0 && p.ganancia === 0)).toBe(true);
  });

  it("acumula ingresos/unidades/ganancia del día correcto", () => {
    const ventas = [
      venta("2026-07-22T10:00:00", 1000, 400, 2),
      venta("2026-07-22T18:00:00", 500, 200, 1),
      venta("2026-07-21T10:00:00", 300, 100, 1),
    ];
    const serie = construirSerieDiaria(ventas, 3, AHORA);
    const hoy = serie.find((p) => p.fecha === "2026-07-22")!;
    const ayer = serie.find((p) => p.fecha === "2026-07-21")!;

    expect(hoy.ingresos).toBe(1500);
    expect(hoy.ganancia).toBe(900);
    expect(hoy.unidades).toBe(3);
    expect(ayer.ingresos).toBe(300);
  });

  it("ignora ventas fuera de la ventana", () => {
    const ventas = [venta("2026-06-01T10:00:00", 999, 0, 5)];
    const serie = construirSerieDiaria(ventas, 3, AHORA);
    const total = serie.reduce((acc, p) => acc + p.ingresos, 0);
    expect(total).toBe(0);
  });
});
