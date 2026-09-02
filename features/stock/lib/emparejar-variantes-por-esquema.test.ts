import { describe, expect, it } from "vitest";
import { buildVariantKey } from "../utils/parse-legacy-variant";
import {
  cambiaElEsquema,
  emparejarPorEsquema,
} from "./emparejar-variantes-por-esquema";

/** Arma la forma que consume el emparejador desde un objeto de atributos. */
function v(valores: Record<string, string>) {
  return { key: buildVariantKey(valores), valores };
}

describe("cambiaElEsquema", () => {
  it("es falso cuando las dos puntas tienen las mismas propiedades", () => {
    const base = [{ Talle: "39", Color: "Marron" }];
    const form = [{ Talle: "40", Color: "Marron" }];
    expect(cambiaElEsquema(base, form)).toBe(false);
  });

  it("es verdadero al agregar una propiedad", () => {
    const base = [{ Talle: "39", Color: "Marron" }];
    const form = [{ Talle: "39", Color: "Marron", Género: "Hombre" }];
    expect(cambiaElEsquema(base, form)).toBe(true);
  });

  it("es falso si no queda ninguna propiedad en común", () => {
    // Sin eje compartido no hay forma de decir que dos combinaciones son la
    // misma: emparejar ahí sería adivinar.
    const base = [{ Talle: "39" }];
    const form = [{ Material: "Cuero" }];
    expect(cambiaElEsquema(base, form)).toBe(false);
  });
});

describe("emparejarPorEsquema", () => {
  it("empareja cuando se agrega una propiedad — el caso de Evens", () => {
    // VANS HYLANE GAMUZA: la grilla tenía Talle + Color y se le sumó Género.
    // Sin emparejar, las 18 combinaciones se leían como borradas.
    const base = [
      v({ Talle: "39", Color: "Negro/blanco" }),
      v({ Talle: "40", Color: "Negro/blanco" }),
      v({ Talle: "39", Color: "Marron" }),
    ];
    const form = [
      v({ Talle: "39", Color: "Negro/blanco", Género: "Hombre" }),
      v({ Talle: "40", Color: "Negro/blanco", Género: "Hombre" }),
      v({ Talle: "39", Color: "Marron", Género: "Hombre" }),
    ];

    const renombres = emparejarPorEsquema(base, form);

    expect(renombres.size).toBe(3);
    expect(renombres.get(base[0].key)).toBe(form[0].key);
    expect(renombres.get(base[1].key)).toBe(form[1].key);
    expect(renombres.get(base[2].key)).toBe(form[2].key);
  });

  it("no empareja la combinación que de verdad se saca de la grilla", () => {
    const base = [
      v({ Talle: "39", Color: "Negro/blanco" }),
      v({ Talle: "44", Color: "Marron" }),
    ];
    const form = [v({ Talle: "39", Color: "Negro/blanco", Género: "Hombre" })];

    const renombres = emparejarPorEsquema(base, form);

    expect(renombres.size).toBe(1);
    expect(renombres.has(base[1].key)).toBe(false);
  });

  it("no empareja cuando dos combinaciones colapsan en la misma key reducida", () => {
    // Al quitar Género, Marrón/35/Hombre y Marrón/35/Mujer quedan iguales:
    // no se puede saber cuál hereda el stock, así que ninguna se empareja.
    const base = [
      v({ Talle: "35", Color: "Marron", Género: "Hombre" }),
      v({ Talle: "35", Color: "Marron", Género: "Mujer" }),
    ];
    const form = [v({ Talle: "35", Color: "Marron" })];

    expect(emparejarPorEsquema(base, form).size).toBe(0);
  });

  it("ignora las combinaciones que ya coinciden key a key", () => {
    // Si el esquema cambia pero una combinación sobrevive idéntica, no es un
    // renombre: el diff normal ya la trata como modificada o sin cambios.
    const base = [v({ Talle: "39", Color: "Marron" })];
    const form = [
      v({ Talle: "39", Color: "Marron" }),
      v({ Talle: "40", Color: "Marron", Género: "Hombre" }),
    ];

    expect(emparejarPorEsquema(base, form).size).toBe(0);
  });

  it("empareja sin importar mayúsculas ni tildes", () => {
    // La misma combinación reconstruida por dos caminos distintos puede
    // traer casing o acentos distintos; buildVariantKey ya normaliza y el
    // emparejamiento tiene que seguir esa regla.
    const base = [v({ TALLE: "39", Color: "MARRON" })];
    const form = [v({ Talle: "39", color: "Marron", Género: "Hombre" })];

    expect(emparejarPorEsquema(base, form).size).toBe(1);
  });

  it("devuelve vacío cuando el esquema no cambia", () => {
    const base = [v({ Talle: "39", Color: "Marron" })];
    const form = [v({ Talle: "40", Color: "Marron" })];

    expect(emparejarPorEsquema(base, form).size).toBe(0);
  });
});
