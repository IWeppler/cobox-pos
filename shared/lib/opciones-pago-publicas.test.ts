import { describe, expect, it } from "vitest";
import {
  opcionesDePagoPublicas,
  type MetodoPublico,
} from "./opciones-pago-publicas";

const metodo = (
  tipo: MetodoPublico["tipo"],
  recargo = 0,
  activo = true,
): MetodoPublico => ({
  tipo,
  recargo_porcentaje: recargo,
  activo,
});

describe("opcionesDePagoPublicas", () => {
  it("agrupa por tipo: los 5 métodos de ClickTostado dan 4 botones o menos", () => {
    // Datos reales: Efectivo, tres TARJETA (0%, 5%, 5%) y una billetera.
    const opciones = opcionesDePagoPublicas([
      metodo("EFECTIVO"),
      metodo("TARJETA", 0),
      metodo("TARJETA", 5),
      metodo("TARJETA", 5),
      metodo("BILLETERA_VIRTUAL"),
    ]);

    expect(opciones.map((o) => o.tipo)).toEqual([
      "EFECTIVO",
      "BILLETERA_VIRTUAL",
      "TARJETA",
    ]);
  });

  it("el recargo del tipo es el MÁS ALTO de sus métodos", () => {
    const opciones = opcionesDePagoPublicas([
      metodo("TARJETA", 0),
      metodo("TARJETA", 5),
    ]);

    // Con el menor, dos de cada tres tarjetas de ClickTostado cobrarían más
    // que el total que la clienta aceptó.
    expect(opciones[0].recargoPorcentaje).toBe(5);
  });

  it("ignora los métodos inactivos", () => {
    const opciones = opcionesDePagoPublicas([
      metodo("EFECTIVO"),
      metodo("TARJETA", 15, false),
    ]);

    expect(opciones.map((o) => o.tipo)).toEqual(["EFECTIVO"]);
  });

  it("un tipo que este código no conoce se descarta en vez de dibujarse vacío", () => {
    const opciones = opcionesDePagoPublicas([
      metodo("EFECTIVO"),
      { tipo: "CRIPTO" as MetodoPublico["tipo"], recargo_porcentaje: 0, activo: true },
    ]);

    expect(opciones).toHaveLength(1);
  });

  it("no devuelve nada si el negocio no tiene métodos activos", () => {
    expect(opcionesDePagoPublicas([])).toEqual([]);
    expect(opcionesDePagoPublicas(null)).toEqual([]);
  });

  it("el efectivo va primero y la tarjeta última", () => {
    const opciones = opcionesDePagoPublicas([
      metodo("TARJETA", 15),
      metodo("TRANSFERENCIA"),
      metodo("EFECTIVO"),
      metodo("BILLETERA_VIRTUAL"),
    ]);

    expect(opciones.map((o) => o.etiqueta)).toEqual([
      "Efectivo",
      "Transferencia",
      "Billetera virtual",
      "Tarjeta",
    ]);
  });
});
