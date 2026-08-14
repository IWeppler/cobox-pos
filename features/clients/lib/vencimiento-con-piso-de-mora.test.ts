import { describe, expect, it } from "vitest";
import { resolverVencimientoConPisoDeMora } from "./vencimiento-con-piso-de-mora";

describe("resolverVencimientoConPisoDeMora", () => {
  it("sin mora cobrada manda el recálculo", () => {
    expect(resolverVencimientoConPisoDeMora("2026-02-01", null)).toBe(
      "2026-02-01",
    );
  });

  it("sin movimientos manuales manda el piso de la mora", () => {
    // El caso que perdonaba mora: anular el último ajuste manual dejaba al
    // cliente sin vencimiento, y sin vencimiento no hay recargo posible.
    expect(resolverVencimientoConPisoDeMora(null, "2026-09-12")).toBe(
      "2026-09-12",
    );
  });

  it("el piso gana cuando el recálculo propone una fecha más vieja", () => {
    // Cobré la mora hoy (piso = hoy + 30) y después edité un ajuste de enero:
    // el recálculo querría volver a febrero, que dejaría al cliente vencido
    // sobre un saldo que ya trae el recargo adentro.
    expect(resolverVencimientoConPisoDeMora("2026-02-01", "2026-09-12")).toBe(
      "2026-09-12",
    );
  });

  it("el recálculo gana cuando propone una fecha más lejana", () => {
    // Corregir una fecha mal cargada tiene que poder alejar el vencimiento:
    // el piso es un mínimo, no un valor fijo.
    expect(resolverVencimientoConPisoDeMora("2026-12-01", "2026-09-12")).toBe(
      "2026-12-01",
    );
  });

  it("sin ninguno de los dos no hay vencimiento", () => {
    expect(resolverVencimientoConPisoDeMora(null, null)).toBeNull();
  });

  it("fechas iguales devuelven esa fecha", () => {
    expect(resolverVencimientoConPisoDeMora("2026-09-12", "2026-09-12")).toBe(
      "2026-09-12",
    );
  });
});
