import { describe, expect, it } from "vitest";
import {
  categoriasFueraDeTemporada,
  estaEnTemporada,
  normalizarTemporada,
} from "./temporada-categoria";

/** Mediodía local: evita que el huso corra el día y con él el mes. */
const enMes = (mes: number) => new Date(2026, mes - 1, 15, 12, 0, 0);

describe("normalizarTemporada", () => {
  it("acepta los cuatro valores del CHECK", () => {
    expect(normalizarTemporada("VERANO")).toBe("VERANO");
    expect(normalizarTemporada("INVIERNO")).toBe("INVIERNO");
    expect(normalizarTemporada("MEDIA_ESTACION")).toBe("MEDIA_ESTACION");
    expect(normalizarTemporada("TODO_EL_ANIO")).toBe("TODO_EL_ANIO");
  });

  it("cae a TODO_EL_ANIO ante basura, que es el valor que NO silencia", () => {
    expect(normalizarTemporada(null)).toBe("TODO_EL_ANIO");
    expect(normalizarTemporada(undefined)).toBe("TODO_EL_ANIO");
    expect(normalizarTemporada("")).toBe("TODO_EL_ANIO");
    expect(normalizarTemporada("primavera")).toBe("TODO_EL_ANIO");
    expect(normalizarTemporada(7)).toBe("TODO_EL_ANIO");
  });
});

describe("estaEnTemporada", () => {
  it("el caso que motivó la señal: camperas en septiembre todavía se venden, en noviembre no", () => {
    expect(estaEnTemporada("INVIERNO", enMes(9))).toBe(true);
    expect(estaEnTemporada("INVIERNO", enMes(11))).toBe(false);
  });

  it("verano se vende de octubre a marzo", () => {
    for (const mes of [10, 11, 12, 1, 2, 3]) {
      expect(estaEnTemporada("VERANO", enMes(mes))).toBe(true);
    }
    for (const mes of [4, 5, 6, 7, 8, 9]) {
      expect(estaEnTemporada("VERANO", enMes(mes))).toBe(false);
    }
  });

  it("invierno se vende de abril a septiembre", () => {
    for (const mes of [4, 5, 6, 7, 8, 9]) {
      expect(estaEnTemporada("INVIERNO", enMes(mes))).toBe(true);
    }
    for (const mes of [10, 11, 12, 1, 2, 3]) {
      expect(estaEnTemporada("INVIERNO", enMes(mes))).toBe(false);
    }
  });

  it("marzo es de verano Y de media estación: las ventanas se solapan a propósito", () => {
    expect(estaEnTemporada("VERANO", enMes(3))).toBe(true);
    expect(estaEnTemporada("MEDIA_ESTACION", enMes(3))).toBe(true);
  });

  it("TODO_EL_ANIO nunca silencia", () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(estaEnTemporada("TODO_EL_ANIO", enMes(mes))).toBe(true);
    }
  });

  it("un valor desconocido tampoco silencia: mostrar es el lado seguro", () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(estaEnTemporada("otoño-invierno", enMes(mes))).toBe(true);
      expect(estaEnTemporada(null, enMes(mes))).toBe(true);
    }
  });
});

describe("categoriasFueraDeTemporada", () => {
  it("devuelve solo las que hay que sacar", () => {
    const categorias = [
      { id: "camperas", temporada: "INVIERNO" },
      { id: "mallas", temporada: "VERANO" },
      { id: "remeras", temporada: "TODO_EL_ANIO" },
      { id: "sin-declarar", temporada: null },
    ];

    // Noviembre: el invierno ya no se vende, el resto sí.
    expect(categoriasFueraDeTemporada(categorias, enMes(11))).toEqual([
      "camperas",
    ]);

    // Julio: la que se cae es la de verano.
    expect(categoriasFueraDeTemporada(categorias, enMes(7))).toEqual(["mallas"]);
  });

  it("una categoría sin temporada declarada nunca se filtra", () => {
    const categorias = [{ id: "a" }, { id: "b", temporada: undefined }];
    for (let mes = 1; mes <= 12; mes++) {
      expect(categoriasFueraDeTemporada(categorias, enMes(mes))).toEqual([]);
    }
  });
});
