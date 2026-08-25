import { describe, it, expect } from 'vitest';
import {
  construirSerie,
  agregarMediaMovil,
  type Granularidad,
  type PuntoSerie,
} from './build-chart-series';
import type { Venta } from '@/entities/ventas/types';

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

/** Rango explícito: construirSerie recibe un rango, no un período del panel
 * — el chart dejó de seguir al selector. */
function rango(inicio: Date, fin: Date) {
  return { inicio, fin };
}

function serieDe(inicio: Date, fin: Date, gran: Granularidad, ventas: Venta[]) {
  return construirSerie(ventas, rango(inicio, fin), gran, MIERCOLES);
}

describe('construirSerie', () => {
  it('un punto por día del rango, recortado en ahora', () => {
    const serie = serieDe(new Date(2026, 6, 20), new Date(2026, 6, 26, 23, 59), 'dia', []);
    // El rango llega al 26 pero ahora es el 22: no se grafican días futuros.
    expect(serie).toHaveLength(3);
    expect(serie[0].etiqueta).toBe('20/07');
    expect(serie[2].etiqueta).toBe('22/07');
  });

  it('rango largo por día: un punto por cada uno', () => {
    const serie = serieDe(new Date(2026, 6, 1), new Date(2026, 6, 22, 23, 59), 'dia', []);
    expect(serie).toHaveLength(22);
    expect(serie[0].etiqueta).toBe('01/07');
    expect(serie[21].etiqueta).toBe('22/07');
  });

  it('granularidad mes: un punto por mes', () => {
    const serie = serieDe(new Date(2026, 0, 1), new Date(2026, 6, 22, 23, 59), 'mes', []);
    expect(serie).toHaveLength(7); // ene…jul
    expect(serie[0].etiqueta).toBe('ene');
    expect(serie[6].etiqueta).toBe('jul');
  });

  it('hoy: un punto por hora transcurrida, sin las horas que todavía no pasaron', () => {
    const serie = serieDe(new Date(2026, 6, 22), new Date(2026, 6, 22, 23, 59), 'hora', []);
    expect(serie).toHaveLength(16); // 00h…15h, no 24
    expect(serie[0].etiqueta).toBe('00h');
    expect(serie[15].etiqueta).toBe('15h');
  });

  it('buckets sin ventas quedan en 0, no se saltean', () => {
    const serie = serieDe(new Date(2026, 6, 20), new Date(2026, 6, 22, 23, 59), 'dia', []);
    expect(
      serie.every((p) => p.ingresos === 0 && p.unidades === 0 && p.ganancia === 0),
    ).toBe(true);
  });

  it('acumula ingresos/unidades/ganancia en el bucket correcto', () => {
    const serie = serieDe(new Date(2026, 6, 20), new Date(2026, 6, 22, 23, 59), 'dia', [
      venta('2026-07-22T10:00:00', 1000, 400, 2),
      venta('2026-07-22T14:00:00', 500, 200, 1),
      venta('2026-07-21T10:00:00', 300, 100, 1),
    ]);

    expect(serie[2].ingresos).toBe(1500);
    expect(serie[2].ganancia).toBe(900);
    expect(serie[2].unidades).toBe(3);
    expect(serie[1].ingresos).toBe(300);
  });

  it('ignora ventas fuera del rango', () => {
    const serie = serieDe(new Date(2026, 6, 20), new Date(2026, 6, 22, 23, 59), 'dia', [
      venta('2026-06-01T10:00:00', 999, 0, 5),
    ]);
    expect(serie.reduce((acc, p) => acc + p.ingresos, 0)).toBe(0);
  });
});

describe("agregarMediaMovil", () => {
  const puntoDe = (ingresos: number, i: number): PuntoSerie => ({
    etiqueta: String(i),
    etiquetaCompleta: String(i),
    ingresos,
    unidades: ingresos / 100,
    ganancia: ingresos / 2,
  });

  // 10 días de $100 cada uno: la media de cualquier ventana completa es 100.
  const serie = Array.from({ length: 10 }, (_, i) => puntoDe(100, i));

  it("los primeros 6 puntos no tienen media: la ventana está incompleta", () => {
    const r = agregarMediaMovil(serie, 7);
    for (let i = 0; i < 6; i++) {
      expect(r[i].ingresosMedia).toBeNull();
    }
    expect(r[6].ingresosMedia).toBe(100);
  });

  it("el último punto (hoy, en curso) tampoco tiene media", () => {
    const r = agregarMediaMovil(serie, 7);
    expect(r[r.length - 1].esHoy).toBe(true);
    expect(r[r.length - 1].ingresosMedia).toBeNull();
    // El anterior, que es ayer y sí es un día completo, sí la tiene.
    expect(r[r.length - 2].esHoy).toBe(false);
    expect(r[r.length - 2].ingresosMedia).toBe(100);
  });

  it("hoy no arrastra la media hacia abajo aunque venga con horas de menos", () => {
    // Mismo caso pero el último día lleva 10 en vez de 100 (son las 9 AM).
    const conHoyParcial = [...serie.slice(0, 9), puntoDe(10, 9)];
    const r = agregarMediaMovil(conHoyParcial, 7);
    // Ayer sigue en 100: su ventana termina en el día 8, hoy no entra.
    expect(r[8].ingresosMedia).toBe(100);
    expect(r[9].ingresosMedia).toBeNull();
  });

  it("promedia las tres métricas sobre la misma ventana", () => {
    const r = agregarMediaMovil(serie, 7);
    expect(r[6].unidadesMedia).toBe(1);
    expect(r[6].gananciaMedia).toBe(50);
  });

  it("con menos días que la ventana no hay ninguna media", () => {
    const corta = Array.from({ length: 4 }, (_, i) => puntoDe(100, i));
    const r = agregarMediaMovil(corta, 7);
    expect(r.every((p) => p.ingresosMedia === null)).toBe(true);
  });
});
