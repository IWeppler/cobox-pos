import { describe, it, expect } from "vitest";
import {
  resolverRangoActual,
  resolverRangoAnterior,
  resolverRangoRanking,
  calcularCrecimiento,
} from "./periodo-ranges";

// Miércoles 2026-07-22 12:00 — día de semana fijo para que los tests no
// dependan de qué día se corran.
const MIERCOLES = new Date(2026, 6, 22, 12, 0, 0);

describe("resolverRangoActual", () => {
  it("hoy: el día completo de 'ahora'", () => {
    const r = resolverRangoActual("hoy", MIERCOLES);
    expect(r.inicio.getDate()).toBe(22);
    expect(r.fin.getDate()).toBe(22);
    expect(r.fin.getHours()).toBe(23);
  });

  it("semana: de lunes de esta semana hasta ahora (no hasta el domingo futuro)", () => {
    const r = resolverRangoActual("semana", MIERCOLES);
    expect(r.inicio.getDay()).toBe(1); // lunes
    expect(r.inicio.getDate()).toBe(20); // lunes 2026-07-20
    expect(r.fin.getDate()).toBe(22); // miércoles, no domingo 26
  });

  it("mes: del día 1 hasta ahora", () => {
    const r = resolverRangoActual("mes", MIERCOLES);
    expect(r.inicio.getDate()).toBe(1);
    expect(r.inicio.getMonth()).toBe(6);
    expect(r.fin.getDate()).toBe(22);
  });
});

describe("resolverRangoAnterior", () => {
  it("hoy: mismo día de la semana anterior, no ayer", () => {
    const r = resolverRangoAnterior("hoy", MIERCOLES);
    expect(r.inicio.getDay()).toBe(3); // sigue siendo miércoles
    expect(r.inicio.getDate()).toBe(15); // miércoles pasado, no martes 21
  });

  it("semana: mismo tramo lunes→miércoles de la semana pasada", () => {
    const r = resolverRangoAnterior("semana", MIERCOLES);
    expect(r.inicio.getDay()).toBe(1);
    expect(r.inicio.getDate()).toBe(13); // lunes semana pasada
    expect(r.fin.getDate()).toBe(15); // miércoles semana pasada, no domingo
    expect(r.fin.getDay()).toBe(3);
  });

  it("mes: mismo día-del-mes en el mes calendario anterior", () => {
    const r = resolverRangoAnterior("mes", MIERCOLES);
    expect(r.inicio.getDate()).toBe(1);
    expect(r.inicio.getMonth()).toBe(5); // junio
    expect(r.fin.getDate()).toBe(22);
    expect(r.fin.getMonth()).toBe(5);
  });

  it("mes: clampea el día si el mes anterior es más corto (31 → 28/29/30)", () => {
    const treintaYUno = new Date(2026, 2, 31, 12, 0, 0); // 31 de marzo
    const r = resolverRangoAnterior("mes", treintaYUno);
    expect(r.inicio.getMonth()).toBe(1); // febrero
    expect(r.fin.getMonth()).toBe(1);
    expect(r.fin.getDate()).toBe(28); // 2026 no es bisiesto
  });
});

describe("resolverRangoRanking", () => {
  it("con selector Hoy o Semana, usa ventana semanal (nunca diaria)", () => {
    const rHoy = resolverRangoRanking("hoy", MIERCOLES);
    const rSemana = resolverRangoRanking("semana", MIERCOLES);
    expect(rHoy).toEqual(resolverRangoActual("semana", MIERCOLES));
    expect(rSemana).toEqual(resolverRangoActual("semana", MIERCOLES));
  });

  it("con selector Mes, usa ventana de mes", () => {
    const r = resolverRangoRanking("mes", MIERCOLES);
    expect(r).toEqual(resolverRangoActual("mes", MIERCOLES));
  });
});

describe("calcularCrecimiento", () => {
  it("crecimiento positivo normal", () => {
    expect(calcularCrecimiento(150, 100)).toBe(50);
  });

  it("período anterior en 0: no inventa un +100%, devuelve 0", () => {
    expect(calcularCrecimiento(100, 0)).toBe(0);
  });

  it("caída", () => {
    expect(calcularCrecimiento(50, 100)).toBe(-50);
  });
});
