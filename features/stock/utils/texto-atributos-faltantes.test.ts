import { describe, expect, it } from "vitest";
import { slugify } from "@/shared/utils/slugify";
import { textoAtributosFaltantes } from "./texto-atributos-faltantes";

const GENERO = { nombre: "Género", requerido: true };
const TALLE = { nombre: "Talle", requerido: true };
const COLOR = { nombre: "Color", requerido: false };

describe("textoAtributosFaltantes", () => {
  it("nombra el atributo que falta, no su slug", () => {
    // El caso real: Estilo Bonito, "Ropa Bebe" exige Género y una campera de
    // bebé quedó sin poder guardarse porque el cartel no decía qué completar.
    const texto = textoAtributosFaltantes(
      [GENERO],
      new Set([slugify("Género")]),
    );

    expect(texto).toBe("Género");
  });

  it("junta varios con coma y una 'y' al final", () => {
    const texto = textoAtributosFaltantes(
      [GENERO, TALLE],
      new Set([slugify("Género"), slugify("Talle")]),
    );

    expect(texto).toBe("Género y Talle");
  });

  it("ignora los atributos que la categoría no marca como requeridos", () => {
    const texto = textoAtributosFaltantes(
      [GENERO, COLOR],
      new Set([slugify("Género")]),
    );

    expect(texto).toBe("Género");
  });

  it("cae a la frase genérica si el slug no matchea ningún nombre", () => {
    // Nunca debería pasar, pero mostrar "genero" crudo en pantalla es peor que
    // una frase vaga.
    const texto = textoAtributosFaltantes([GENERO], new Set(["material"]));

    expect(texto).toBe("los atributos requeridos");
  });

  it("sin faltantes también devuelve la frase genérica", () => {
    expect(textoAtributosFaltantes([GENERO], new Set())).toBe(
      "los atributos requeridos",
    );
  });
});
