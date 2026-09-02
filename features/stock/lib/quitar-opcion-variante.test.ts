import { describe, expect, it } from "vitest";
import type { Opcion } from "../types";
import { quitarOpcionVariante } from "./quitar-opcion-variante";

const color: Opcion = { id: "1", nombre: "Color", valores: ["Negro"] };
const talle: Opcion = { id: "2", nombre: "Talle", valores: ["39"] };
const requerida: Opcion = {
  id: "3",
  nombre: "Género",
  valores: ["Hombre"],
  bloqueado: true,
};

describe("quitarOpcionVariante", () => {
  it("elimina la propiedad pedida", () => {
    // El caso que estaba roto: el tacho no borraba nada.
    const resultado = quitarOpcionVariante([color, talle], "1");
    expect(resultado).toEqual([talle]);
  });

  it("conserva una propiedad bloqueada por la categoría", () => {
    // La versión anterior borraba justo esta y ninguna otra.
    const resultado = quitarOpcionVariante([color, requerida], "3");
    expect(resultado).toEqual([color, requerida]);
  });

  it("no toca nada si el id no existe", () => {
    const opciones = [color, talle];
    expect(quitarOpcionVariante(opciones, "inexistente")).toEqual(opciones);
  });

  it("deja la lista vacía al sacar la única propiedad", () => {
    expect(quitarOpcionVariante([color], "1")).toEqual([]);
  });
});
