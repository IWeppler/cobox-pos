import { describe, expect, it } from "vitest";
import {
  agruparValoresPorFamilia,
  distanciaEdicion,
  esPropiedadColor,
  familiaPorEtiqueta,
  resolverFamiliaColor,
} from "./color-familias";

/** Atajo: la clave de familia de un valor crudo, o null. */
const familia = (valor: string) => resolverFamiliaColor(valor)?.clave ?? null;

describe("esPropiedadColor", () => {
  it("reconoce la propiedad con y sin acento o mayúsculas", () => {
    expect(esPropiedadColor("Color")).toBe(true);
    expect(esPropiedadColor("COLOR")).toBe(true);
    expect(esPropiedadColor("Color principal")).toBe(true);
    expect(esPropiedadColor("Talle")).toBe(false);
  });
});

describe("resolverFamiliaColor — valores base", () => {
  it("mapea los colores simples", () => {
    expect(familia("negro")).toBe("negro");
    expect(familia("Blanco")).toBe("blanco");
    expect(familia("AZUL")).toBe("azul");
  });

  it("junta sinónimos que el comercio usa como equivalentes", () => {
    expect(familia("rosado")).toBe("rosa");
    expect(familia("rosada")).toBe("rosa");
    expect(familia("fucsia")).toBe("rosa");
    expect(familia("colorado")).toBe("rojo");
  });

  it("resuelve plurales y femeninos", () => {
    expect(familia("negras")).toBe("negro");
    expect(familia("blanca")).toBe("blanco");
    expect(familia("estampadas")).toBe("estampado");
  });
});

describe("resolverFamiliaColor — tonos y combinaciones", () => {
  it("un tono cae en su familia base", () => {
    expect(familia("rosa viejo")).toBe("rosa");
    expect(familia("rosa bebe")).toBe("rosa");
    expect(familia("verde militar")).toBe("verde");
    expect(familia("verde agua")).toBe("verde");
    expect(familia("gris topo")).toBe("gris");
    expect(familia("azul francia")).toBe("azul");
    expect(familia("gris melange")).toBe("gris");
  });

  it("en una combinación manda el primer color", () => {
    expect(familia("blanco/negro")).toBe("blanco");
    expect(familia("negro/blanco")).toBe("negro");
    expect(familia("gris/beige/uva/marron")).toBe("gris");
    expect(familia("blanco/ verde")).toBe("blanco");
  });

  it("ignora el motivo o la marca pegados al color", () => {
    expect(familia("azul con bigote")).toBe("azul");
    expect(familia("negro con brillo")).toBe("negro");
    expect(familia("negro y fluor")).toBe("negro");
    expect(familia("negro nike")).toBe("negro");
    expect(familia("azul spider")).toBe("azul");
    expect(familia("azul/azul")).toBe("azul");
  });

  it("si el primer segmento no es un color, sigue buscando en el resto", () => {
    expect(familia("completas/negras")).toBe("negro");
  });

  it("una frase con color propio se resuelve entera", () => {
    expect(familia("borra vino")).toBe("bordo");
    expect(familia("animal print")).toBe("estampado");
  });

  it("agrupa los motivos en Estampado", () => {
    expect(familia("estampado")).toBe("estampado");
    expect(familia("rayado")).toBe("estampado");
    expect(familia("surtido")).toBe("estampado");
    expect(familia("varios")).toBe("estampado");
    expect(familia("cebra")).toBe("estampado");
    expect(familia("vaquita")).toBe("estampado");
  });
});

describe("resolverFamiliaColor — typos reales del catálogo", () => {
  it("corrige errores de tipeo comunes", () => {
    expect(familia("asul")).toBe("azul");
    expect(familia("amarrillo")).toBe("amarillo");
    expect(familia("amarrilo")).toBe("amarillo");
    expect(familia("biege")).toBe("beige");
    expect(familia("verede menta")).toBe("verde");
    expect(familia("fucsisa")).toBe("rosa");
    expect(familia("rosaa")).toBe("rosa");
    expect(familia("cholate")).toBe("marron");
    expect(familia("chocoalte")).toBe("marron");
    expect(familia("duranzo")).toBe("naranja");
    expect(familia("vison")).toBe("beige");
    expect(familia("chanpagne")).toBe("beige");
  });

  it("NO confunde colores distintos que se parecen de escritura", () => {
    // "lima" está a distancia 1 de "lila" pero es verde, no violeta: el paso
    // exacto tiene que ganarle siempre al aproximado.
    expect(familia("lima")).toBe("verde");
    expect(familia("lila")).toBe("violeta");
    // Idem con estos, que conviven en el catálogo real.
    expect(familia("rosa")).toBe("rosa");
    expect(familia("roja")).toBe("rojo");
  });

  it("no inventa familia para palabras demasiado cortas", () => {
    expect(familia("uva")).toBe("violeta"); // exacto, no aproximado
    expect(familia("nut")).toBe("marron"); // exacto
    expect(familia("abc")).toBeNull();
  });
});

describe("resolverFamiliaColor — lo que no se puede clasificar", () => {
  it("devuelve null en vez de forzar una familia", () => {
    expect(familia("liso")).toBeNull();
    expect(familia("claro")).toBeNull();
    expect(familia("boca")).toBeNull();
    expect(familia("aereo")).toBeNull();
    expect(familia("")).toBeNull();
    expect(familia("   ")).toBeNull();
  });
});

describe("agruparValoresPorFamilia", () => {
  it("deduplica y respeta el orden declarado de familias", () => {
    const grupos = agruparValoresPorFamilia([
      "azul",
      "asul",
      "azul/azul",
      "negro",
      "rojo",
      "colorado",
    ]);
    expect(grupos.map((g) => g.clave)).toEqual(["negro", "rojo", "azul"]);
  });

  it("manda a Otros lo no clasificable, y siempre al final", () => {
    const grupos = agruparValoresPorFamilia(["liso", "azul", "boca"]);
    expect(grupos.map((g) => g.clave)).toEqual(["azul", "otros"]);
  });

  it("no agrega Otros si no hace falta", () => {
    const grupos = agruparValoresPorFamilia(["azul", "negro"]);
    expect(grupos.some((g) => g.clave === "otros")).toBe(false);
  });

  it("un valor vacío no genera Otros", () => {
    const grupos = agruparValoresPorFamilia(["azul", "  "]);
    expect(grupos.map((g) => g.clave)).toEqual(["azul"]);
  });

  it("colapsa de verdad: muchos crudos, pocas familias", () => {
    const crudos = [
      "rosa", "rosado", "rosada", "rosa viejo", "rosa bebe", "rosa chicle",
      "fucsia", "fucsisa", "magenta", "coral", "salmon", "rosa fluor",
      "rosa pastel", "rosa/blanco", "rosaa",
    ];
    expect(agruparValoresPorFamilia(crudos).map((g) => g.clave)).toEqual(["rosa"]);
  });
});

describe("familiaPorEtiqueta", () => {
  it("resuelve ida y vuelta, tolerando acentos", () => {
    expect(familiaPorEtiqueta("Marrón")?.clave).toBe("marron");
    expect(familiaPorEtiqueta("marron")?.clave).toBe("marron");
    expect(familiaPorEtiqueta("Otros")?.clave).toBe("otros");
    expect(familiaPorEtiqueta("Inexistente")).toBeNull();
  });
});

describe("distanciaEdicion", () => {
  it("cuenta una transposición como un solo error", () => {
    expect(distanciaEdicion("biege", "beige")).toBe(1);
    expect(distanciaEdicion("chocoalte", "chocolate")).toBe(1);
  });

  it("cuenta sustituciones e inserciones", () => {
    expect(distanciaEdicion("asul", "azul")).toBe(1);
    expect(distanciaEdicion("amarrillo", "amarillo")).toBe(1);
    expect(distanciaEdicion("azul", "azul")).toBe(0);
  });
});
