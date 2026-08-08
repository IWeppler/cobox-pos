import { describe, expect, it } from "vitest";
import {
  alternarValorFiltro,
  contarFiltrosAplicados,
  estaSeleccionado,
  ordenarSeccionesFiltro,
  parsearValoresFiltro,
  serializarValoresFiltro,
} from "./filtros-url";

describe("parsearValoresFiltro", () => {
  it("lee varios valores separados por coma", () => {
    expect(parsearValoresFiltro("Azul,Negro")).toEqual(["Azul", "Negro"]);
  });

  it("un link viejo de un solo valor sigue funcionando", () => {
    expect(parsearValoresFiltro("Azul")).toEqual(["Azul"]);
  });

  it("ignora vacíos y espacios de más", () => {
    expect(parsearValoresFiltro(" Azul , , Negro ")).toEqual(["Azul", "Negro"]);
    expect(parsearValoresFiltro(",,,")).toEqual([]);
  });

  it("deduplica ignorando acentos y mayúsculas, conservando el primero", () => {
    expect(parsearValoresFiltro("Marrón,marron,MARRON")).toEqual(["Marrón"]);
  });

  it("tolera null", () => {
    expect(parsearValoresFiltro(null)).toEqual([]);
  });
});

describe("serializarValoresFiltro", () => {
  it("arma el parámetro", () => {
    expect(serializarValoresFiltro(["Azul", "Negro"])).toBe("Azul,Negro");
  });

  it("devuelve null cuando no queda nada, para borrar el parámetro", () => {
    expect(serializarValoresFiltro([])).toBeNull();
    expect(serializarValoresFiltro(["  "])).toBeNull();
  });

  it("ida y vuelta estable", () => {
    const valores = ["Azul", "Negro", "Marrón"];
    expect(parsearValoresFiltro(serializarValoresFiltro(valores))).toEqual(
      valores,
    );
  });
});

describe("alternarValorFiltro", () => {
  it("agrega lo que no estaba", () => {
    expect(alternarValorFiltro(["Azul"], "Negro")).toEqual(["Azul", "Negro"]);
  });

  it("saca lo que ya estaba (toggle)", () => {
    expect(alternarValorFiltro(["Azul", "Negro"], "Azul")).toEqual(["Negro"]);
  });

  it("el toggle ignora acentos y mayúsculas", () => {
    expect(alternarValorFiltro(["Marrón"], "marron")).toEqual([]);
  });

  it("deja la lista vacía al sacar el último", () => {
    expect(alternarValorFiltro(["Azul"], "Azul")).toEqual([]);
  });
});

describe("estaSeleccionado", () => {
  it("compara sin importar acentos ni mayúsculas", () => {
    expect(estaSeleccionado(["Marrón"], "marron")).toBe(true);
    expect(estaSeleccionado(["Azul"], "Negro")).toBe(false);
    expect(estaSeleccionado([], "Azul")).toBe(false);
  });
});

describe("ordenarSeccionesFiltro", () => {
  it("Talle va último y Género/Color primero", () => {
    const orden = ordenarSeccionesFiltro([
      ["Talle", []],
      ["Color", []],
      ["Género", []],
    ]).map(([n]) => n);
    expect(orden).toEqual(["Género", "Color", "Talle"]);
  });

  it("las propiedades sueltas van al medio, alfabéticas", () => {
    const orden = ordenarSeccionesFiltro([
      ["Talle", []],
      ["Material", []],
      ["Color", []],
      ["Estilo", []],
    ]).map(([n]) => n);
    expect(orden).toEqual(["Color", "Estilo", "Material", "Talle"]);
  });

  it("no muta el array recibido", () => {
    const original: [string, string[]][] = [
      ["Talle", []],
      ["Color", []],
    ];
    ordenarSeccionesFiltro(original);
    expect(original.map(([n]) => n)).toEqual(["Talle", "Color"]);
  });
});

describe("contarFiltrosAplicados", () => {
  it("suma todas las propiedades", () => {
    expect(
      contarFiltrosAplicados({ Color: ["Azul", "Negro"], Talle: ["M"] }),
    ).toBe(3);
  });

  it("cuenta cero sin filtros", () => {
    expect(contarFiltrosAplicados({})).toBe(0);
    expect(contarFiltrosAplicados({ Color: [] })).toBe(0);
  });
});
