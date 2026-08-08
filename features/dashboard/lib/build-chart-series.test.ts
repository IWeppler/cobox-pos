import { describe, it, expect } from "vitest";
import {
  construirSerieComparada,
  granularidadPara,
} from "./build-chart-series";
import {
  resolverRangoActual,
  resolverRangoAnterior,
} from "./periodo-ranges";
import type { Venta } from "@/entities/ventas/types";

const MIERCOLES = new Date(2026, 6, 22, 15, 0, 0); // miércoles 2026-07-22

function venta(
  fecha: string,
  total: number,
  costo: number,
  cantidad: number,
): Venta {
  return {
    id: crypto.randomUUID(),
    total,
    precio_costo: costo,
    cantidad,
    fecha_venta: fecha,
  } as Venta;
}

function serieDe(periodo: Parameters<typeof granularidadPara>[0], ventas: Venta[]) {
  return construirSerieComparada(
    ventas,
    resolverRangoActual(periodo, MIERCOLES),
    resolverRangoAnterior(periodo, MIERCOLES),
    granularidadPara(periodo),
    MIERCOLES,
  );
}

describe("granularidadPara", () => {
  it("hoy va por hora, año por mes, el resto por día", () => {
    expect(granularidadPara("hoy")).toBe("hora");
    expect(granularidadPara("semana")).toBe("dia");
    expect(granularidadPara("mes")).toBe("dia");
    expect(granularidadPara("anio")).toBe("mes");
  });
});

describe("construirSerieComparada", () => {
  it("semana: un punto por día desde el lunes hasta hoy (no hasta el domingo)", () => {
    const serie = serieDe("semana", []);
    expect(serie).toHaveLength(3); // lunes 20, martes 21, miércoles 22
    expect(serie[0].etiqueta).toBe("20/07");
    expect(serie[2].etiqueta).toBe("22/07");
  });

  it("mes: un punto por día desde el 1 hasta hoy", () => {
    const serie = serieDe("mes", []);
    expect(serie).toHaveLength(22);
    expect(serie[0].etiqueta).toBe("01/07");
    expect(serie[21].etiqueta).toBe("22/07");
  });

  it("año: un punto por mes desde enero hasta el mes actual", () => {
    const serie = serieDe("anio", []);
    expect(serie).toHaveLength(7); // ene…jul
    expect(serie[0].etiqueta).toBe("ene");
    expect(serie[6].etiqueta).toBe("jul");
  });

  it("hoy: un punto por hora transcurrida, sin las horas que todavía no pasaron", () => {
    const serie = serieDe("hoy", []);
    expect(serie).toHaveLength(16); // 00h…15h, no 24
    expect(serie[0].etiqueta).toBe("00h");
    expect(serie[15].etiqueta).toBe("15h");
  });

  it("hoy: la comparación es contra las mismas horas de ayer", () => {
    const serie = serieDe("hoy", [
      venta("2026-07-22T10:30:00", 800, 0, 1),
      venta("2026-07-21T10:30:00", 600, 0, 1), // misma hora, ayer
      venta("2026-07-21T20:00:00", 999, 0, 1), // ayer a la noche: fuera del tramo
    ]);
    expect(serie[10].ingresos).toBe(800);
    expect(serie[10].ingresosAnterior).toBe(600);
    const totalAnterior = serie.reduce(
      (acc, p) => acc + (p.ingresosAnterior ?? 0),
      0,
    );
    expect(totalAnterior).toBe(600);
  });

  it("buckets sin ventas quedan en 0, no se saltean", () => {
    const serie = serieDe("semana", []);
    expect(
      serie.every((p) => p.ingresos === 0 && p.unidades === 0 && p.ganancia === 0),
    ).toBe(true);
  });

  it("acumula ingresos/unidades/ganancia en el bucket correcto", () => {
    const serie = serieDe("semana", [
      venta("2026-07-22T10:00:00", 1000, 400, 2),
      venta("2026-07-22T14:00:00", 500, 200, 1),
      venta("2026-07-21T10:00:00", 300, 100, 1),
    ]);
    const miercoles = serie[2];
    const martes = serie[1];

    expect(miercoles.ingresos).toBe(1500);
    expect(miercoles.ganancia).toBe(900);
    expect(miercoles.unidades).toBe(3);
    expect(martes.ingresos).toBe(300);
  });

  it("las ventas del período anterior van a la serie de comparación, alineadas por posición", () => {
    const serie = serieDe("semana", [
      venta("2026-07-22T10:00:00", 1000, 0, 1), // miércoles de esta semana
      venta("2026-07-15T10:00:00", 400, 0, 1), // miércoles de la semana pasada
    ]);

    expect(serie[2].ingresos).toBe(1000);
    expect(serie[2].ingresosAnterior).toBe(400);
    expect(serie[2].etiquetaCompleta).toBe("22/07/2026");
    expect(serie[2].etiquetaCompletaAnterior).toBe("15/07/2026");
  });

  it("ignora ventas fuera de ambos rangos", () => {
    const serie = serieDe("semana", [venta("2026-06-01T10:00:00", 999, 0, 5)]);
    const total = serie.reduce(
      (acc, p) => acc + p.ingresos + (p.ingresosAnterior ?? 0),
      0,
    );
    expect(total).toBe(0);
  });

  it("mes actual más largo que el anterior: la cola de comparación queda en null, no en 0", () => {
    const treintaYUno = new Date(2026, 2, 31, 12, 0, 0); // 31 de marzo
    const serie = construirSerieComparada(
      [],
      resolverRangoActual("mes", treintaYUno),
      resolverRangoAnterior("mes", treintaYUno), // febrero: 28 días
      "dia",
      treintaYUno,
    );

    expect(serie).toHaveLength(31);
    expect(serie[27].ingresosAnterior).toBe(0); // 28 de febrero existe
    expect(serie[28].ingresosAnterior).toBeNull(); // 29/02/2026 no existe
    expect(serie[28].etiquetaCompletaAnterior).toBeNull();
  });

  it("el último bucket del período anterior se corta en el mismo día (comparación justa)", () => {
    // A mitad de mes, una venta del día 25 del mes anterior NO entra: el
    // rango anterior termina el día 22.
    const serie = serieDe("mes", [venta("2026-06-25T10:00:00", 5000, 0, 1)]);
    const totalAnterior = serie.reduce(
      (acc, p) => acc + (p.ingresosAnterior ?? 0),
      0,
    );
    expect(totalAnterior).toBe(0);
  });
});
