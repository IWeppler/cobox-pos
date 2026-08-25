import { describe, it, expect } from "vitest";
import {
  resolverRangoActual,
  resolverRangoAnterior,
  resolverRangoRanking,
  resolverRangoRolling,
  crecimientoDeTotal,
  crecimientoDeMedia,
  calcularCrecimiento,
  type PeriodoPanel,
} from "@/shared/lib/periodo-ranges";

// Miércoles 2026-07-22 12:00 — día de semana fijo para que los tests no
// dependan de qué día se corran.
const MIERCOLES = new Date(2026, 6, 22, 12, 0, 0);

const TODOS: PeriodoPanel[] = ["hoy", "semana", "mes", "trimestre", "anio"];

describe("resolverRangoActual — ventanas móviles", () => {
  const DIA_MS = 24 * 60 * 60 * 1000;
  const largo = (p: PeriodoPanel) =>
    Math.round(
      (resolverRangoActual(p, MIERCOLES).fin.getTime() -
        resolverRangoActual(p, MIERCOLES).inicio.getTime()) /
        DIA_MS,
    );

  it("cada período dura sus días y termina hoy", () => {
    expect(largo("hoy")).toBe(1);
    expect(largo("semana")).toBe(7);
    expect(largo("mes")).toBe(28);
    expect(largo("trimestre")).toBe(91);
    expect(largo("anio")).toBe(364);
  });

  it("la ventana siempre termina hoy, no en el fin de semana calendario", () => {
    for (const p of TODOS) {
      const r = resolverRangoActual(p, MIERCOLES);
      expect(r.fin.getDate()).toBe(22);
      expect(r.fin.getHours()).toBe(23);
    }
  });

  it("semana: los 7 días que terminan hoy, no desde el lunes", () => {
    const r = resolverRangoActual("semana", MIERCOLES);
    expect(r.inicio.getDate()).toBe(16); // jueves 16/7, no el lunes 20
  });
});

describe("resolverRangoAnterior — alineada por día de la semana", () => {
  it("hoy se compara contra el MISMO día de la semana pasada, no contra ayer", () => {
    // Es el bug que motivó todo esto: hoy martes contra ayer lunes daba +66%
    // y contra el martes anterior −42%. El sábado hace 17,67 ventas por día y
    // el lunes 3,75, así que comparar días distintos mide el calendario.
    const r = resolverRangoAnterior("hoy", MIERCOLES);
    expect(r.inicio.getDay()).toBe(MIERCOLES.getDay());
    expect(r.inicio.getDate()).toBe(15); // miércoles anterior, no el martes 21
  });

  it("todas las ventanas caen en los mismos días de la semana", () => {
    for (const p of TODOS) {
      const actual = resolverRangoActual(p, MIERCOLES);
      const anterior = resolverRangoAnterior(p, MIERCOLES);
      expect(anterior.inicio.getDay()).toBe(actual.inicio.getDay());
      expect(anterior.fin.getDay()).toBe(actual.fin.getDay());
    }
  });

  it("la ventana anterior dura exactamente lo mismo que la actual", () => {
    for (const p of TODOS) {
      const actual = resolverRangoActual(p, MIERCOLES);
      const anterior = resolverRangoAnterior(p, MIERCOLES);
      expect(anterior.fin.getTime() - anterior.inicio.getTime()).toBe(
        actual.fin.getTime() - actual.inicio.getTime(),
      );
    }
  });

  it("la anterior termina justo antes de que empiece la actual", () => {
    const actual = resolverRangoActual("semana", MIERCOLES);
    const anterior = resolverRangoAnterior("semana", MIERCOLES);
    expect(actual.inicio.getTime() - anterior.fin.getTime()).toBe(1);
  });
});

describe("resolverRangoRanking", () => {
  it("con Hoy usa la ventana de 7 días: un día es mala muestra para rotación", () => {
    expect(resolverRangoRanking("hoy", MIERCOLES)).toEqual(
      resolverRangoActual("semana", MIERCOLES),
    );
  });

  it("con el resto usa su propia ventana", () => {
    for (const p of TODOS.filter((x) => x !== "hoy")) {
      expect(resolverRangoRanking(p, MIERCOLES)).toEqual(
        resolverRangoActual(p, MIERCOLES),
      );
    }
  });
});

describe("calcularCrecimiento", () => {
  it("crecimiento positivo normal", () => {
    expect(calcularCrecimiento(150, 100)).toBe(50);
  });

  it("período anterior en 0: no inventa un +100% ni un +0%, devuelve null", () => {
    expect(calcularCrecimiento(100, 0)).toBeNull();
  });

  it("caída", () => {
    expect(calcularCrecimiento(50, 100)).toBe(-50);
  });
});

describe("resolverRangoRolling", () => {
  const DIA_MS = 24 * 60 * 60 * 1000;

  it("la ventana termina hoy e incluye hoy como uno de los N días", () => {
    const r = resolverRangoRolling(28, MIERCOLES);
    expect(r.fin.getDate()).toBe(22);
    expect(r.fin.getHours()).toBe(23);
    // 28 días contando hoy: 22/7 hacia atrás cae en 25/6.
    expect(r.inicio.getMonth()).toBe(5); // junio
    expect(r.inicio.getDate()).toBe(25);
    expect(r.inicio.getHours()).toBe(0);
  });

  it("dura exactamente los días pedidos", () => {
    const r = resolverRangoRolling(28, MIERCOLES);
    expect(Math.round((r.fin.getTime() - r.inicio.getTime()) / DIA_MS)).toBe(28);
  });

  it("28 días contienen 4 de cada día de la semana", () => {
    // Es el motivo de 28 y no 30: con 30 sobran dos días de cola y la ventana
    // queda con dos sábados de más, que en estos negocios pesan 4,7 lunes.
    const r = resolverRangoRolling(28, MIERCOLES);
    const porDia = new Map<number, number>();
    const cursor = new Date(r.inicio);
    while (cursor <= r.fin) {
      porDia.set(cursor.getDay(), (porDia.get(cursor.getDay()) ?? 0) + 1);
      cursor.setDate(cursor.getDate() + 1);
    }
    expect(porDia.size).toBe(7);
    expect([...porDia.values()].every((n) => n === 4)).toBe(true);
  });

  it("es la misma ventana el día 1 del mes que el 28 (no depende del calendario)", () => {
    const primeroDeMes = new Date(2026, 7, 1, 10, 0, 0);
    const r = resolverRangoRolling(28, primeroDeMes);
    expect(Math.round((r.fin.getTime() - r.inicio.getTime()) / DIA_MS)).toBe(28);
    expect(r.inicio.getMonth()).toBe(6); // 5 de julio, no el 1 de agosto
    expect(r.inicio.getDate()).toBe(5);
  });
});

describe("crecimientoDeTotal", () => {
  it("con ventanas de actividad pareja compara totales", () => {
    // Lo normal con ventanas móviles: 6 días abiertos contra 6.
    const r = crecimientoDeTotal(2791150, 5836825, 6, 6);
    expect(r!).toBeCloseTo(-52.2, 1);
  });

  it("un día de diferencia no oculta nada", () => {
    expect(crecimientoDeTotal(1000, 900, 22, 21)).not.toBeNull();
  });

  it("el caso que sí queda en s/d: el tramo anterior es de otra época", () => {
    // Ventana de 28 días hoy en Evens: 24 días abiertos contra 12, porque la
    // ventana previa cae en julio con el POS a medio adoptar. Ahí el % mide
    // la adopción del sistema, no las ventas.
    expect(crecimientoDeTotal(14228095, 4226030, 24, 12)).toBeNull();
  });

  it("sin período anterior sigue devolviendo null", () => {
    expect(crecimientoDeTotal(1000, 0, 3, 3)).toBeNull();
  });

  it("sin días abiertos en alguno de los tramos, no compara", () => {
    expect(crecimientoDeTotal(1000, 900, 2, 0)).toBeNull();
    expect(crecimientoDeTotal(1000, 900, 0, 2)).toBeNull();
  });
});

describe("crecimientoDeMedia", () => {
  it("el caso real que lo motivó: 6 tickets con un outlier no comparan", () => {
    // Evens, martes 25/8/2026. Tramo anterior: 6 tickets, media $75.917 con
    // uno de $204.700 adentro. Tramo actual: 23 tickets, media $18.322.
    // La cuenta da −75,9%, pero con esa dispersión no se sostiene.
    const r = crecimientoDeMedia(
      { media: 18322, desvio: 14000, n: 23 },
      { media: 75917, desvio: 75000, n: 6 },
    );
    expect(r).toBeNull();
  });

  it("la misma caída con muestra grande sí se muestra", () => {
    const r = crecimientoDeMedia(
      { media: 18322, desvio: 14000, n: 400 },
      { media: 75917, desvio: 75000, n: 400 },
    );
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(-75.9, 0);
  });

  it("una diferencia chica no se muestra aunque haya muchos tickets", () => {
    // 36.172 contra 37.000 con CV ~1: dentro del ruido, no es una caída.
    const r = crecimientoDeMedia(
      { media: 36172, desvio: 38887, n: 408 },
      { media: 37000, desvio: 38887, n: 408 },
    );
    expect(r).toBeNull();
  });

  it("con tickets parejos (electro) alcanza significancia con pocos", () => {
    const r = crecimientoDeMedia(
      { media: 100000, desvio: 2000, n: 10 },
      { media: 150000, desvio: 2000, n: 10 },
    );
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(-33.3, 0);
  });

  it("fail-closed: sin muestra para estimar el desvío no compara", () => {
    expect(
      crecimientoDeMedia(
        { media: 10000, desvio: 0, n: 1 },
        { media: 50000, desvio: 0, n: 1 },
      ),
    ).toBeNull();
  });

  it("sin período anterior devuelve null, igual que calcularCrecimiento", () => {
    expect(
      crecimientoDeMedia(
        { media: 10000, desvio: 1000, n: 30 },
        { media: 0, desvio: 0, n: 0 },
      ),
    ).toBeNull();
  });
});
