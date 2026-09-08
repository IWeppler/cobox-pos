import { describe, expect, it } from "vitest";
import { construirPesos, evaluarCandidato, tokenizarNombre } from "./afinidad-nombre";

/**
 * Catálogo de prueba con la forma del real: una familia larga de vestidos de
 * egresada (donde "vestido" y "egresada" no distinguen nada) y ropa suelta.
 */
const CATALOGO = [
  "VESTIDO EGRESADA ALINA",
  "VESTIDO EGRESADA AMBAR",
  "VESTIDO EGRESADA LUCI",
  "VESTIDO EGRESADA MORE",
  "VESTIDO EGRESADA JULI",
  "VESTIDO DE FIESTA IMPORTADOS",
  "CAMISA CADARUVE",
  "CAMISA CADARUVE RAYADA",
  "CAMISA CADARUVE RR",
  "BUZO FRISADO NEGRO",
  "JEANS MOON MAR-24",
  "REMERA DEPORTIVA NIKE",
];

const pesos = construirPesos(CATALOGO);
const evaluar = (remito: string, candidato: string) =>
  evaluarCandidato(remito, candidato, pesos, CATALOGO.length);

describe("tokenizar", () => {
  it("normaliza acentos, mayúsculas y separadores", () => {
    expect(tokenizarNombre("JEANS MOON MAR-24")).toEqual(["jeans", "moon", "mar", "24"]);
    expect(tokenizarNombre("Camisón Ñandú")).toEqual(["camison", "nandu"]);
  });
});

describe("los casos que motivaron esto", () => {
  it("dos vestidos de egresada distintos NO son confiables", () => {
    // Por trigramas puntúan 0,77 y la pantalla los ofrecía con el mismo botón
    // que una asociación correcta. Lo que los distingue —el nombre propio— es
    // justo lo que el trigrama diluye.
    const r = evaluar("VESTIDO EGRESADA ALANA", "VESTIDO EGRESADA ALINA");

    expect(r.confianza).toBe("baja");
    expect(r.faltantes).toContain("alana");
    expect(r.sobrantes).toContain("alina");
  });

  it("una camisa con sufijo distinto tampoco", () => {
    const r = evaluar("CAMISA CADARUVE CF", "CAMISA CADARUVE");

    expect(r.confianza).toBe("baja");
    expect(r.faltantes).toEqual(["cf"]);
  });

  it("y menos todavía entre dos sufijos distintos", () => {
    expect(evaluar("CAMISA CADARUVE CF", "CAMISA CADARUVE RR").confianza).toBe("baja");
  });
});

describe("el caso para el que la función existe", () => {
  it("el mismo producto escrito distinto SÍ es confiable", () => {
    // Este es el objetivo: que no tengas que acordarte de que ya lo cargaste.
    expect(evaluar("buzo frisado negro", "BUZO FRISADO NEGRO").confianza).toBe("alta");
    expect(evaluar("Buzo Frisado Negro", "BUZO FRISADO NEGRO").cobertura).toBe(1);
  });

  it("tolera acentos y guiones", () => {
    expect(evaluar("jeans moon mar 24", "JEANS MOON MAR-24").confianza).toBe("alta");
  });

  it("el orden de las palabras no importa", () => {
    expect(evaluar("NEGRO BUZO FRISADO", "BUZO FRISADO NEGRO").confianza).toBe("alta");
  });

  it("una palabra común de más pesa menos cuanto más grande es el catálogo", () => {
    // La propiedad que hace funcionar todo esto: el peso de una palabra
    // depende del catálogo. En uno de 12 productos "vestido" todavía pesa
    // bastante y perderla deja la cobertura al borde; en uno real —1.606
    // productos en Evens, con "vestido" en cientos— pierde casi todo su peso y
    // lo que manda es el nombre propio.
    const chico = evaluar("VESTIDO EGRESADA ALINA", "EGRESADA ALINA");
    expect(chico.faltantes).toEqual(["vestido"]);

    const catalogoGrande = [
      ...CATALOGO,
      ...Array.from({ length: 200 }, (_, i) => `VESTIDO MODELO ${i}`),
    ];
    const grande = evaluarCandidato(
      "VESTIDO EGRESADA ALINA",
      "EGRESADA ALINA",
      construirPesos(catalogoGrande),
      catalogoGrande.length,
    );

    expect(grande.cobertura).toBeGreaterThan(chico.cobertura);
    expect(grande.confianza).toBe("alta");
  });
});

/**
 * Validación contra el catálogo REAL de Evens (muestra de las familias que
 * dieron problema, tomada de producción el 8/9/2026). Un umbral que funciona
 * con doce nombres inventados no prueba nada: lo que importa es que separe
 * bien donde los nombres se parecen de verdad.
 */
describe("contra el catálogo real de Evens", () => {
  const EVENS = [
    "VESTIDO EGRESADA 11", "VESTIDO EGRESADA 212", "VESTIDO EGRESADA ABRIL",
    "VESTIDO EGRESADA ALANA", "VESTIDO EGRESADA ALEJANDRA", "VESTIDO EGRESADA ALINA",
    "VESTIDO EGRESADA AMBAR", "VESTIDO EGRESADA AMELIA", "VESTIDO EGRESADA ANAHI",
    "VESTIDO EGRESADA ARANZA", "VESTIDO EGRESADA AYELEN", "VESTIDO EGRESADA CARLA",
    "VESTIDO EGRESADA GIORGINA", "VESTIDO EGRESADA IRENE", "VESTIDO EGRESADA ISABELA",
    "VESTIDO EGRESADA JULI", "VESTIDO EGRESADA LEYDI", "VESTIDO EGRESADA LUCI",
    "VESTIDO EGRESADA MARTINA", "VESTIDO EGRESADA MIKA", "VESTIDO EGRESADA MORE",
    "VESTIDO EGRESADA PAU", "VESTIDO EGRESADA ROSSY", "VESTIDO EGRESADA RUBY",
    "VESTIDO EGRESADA TALI", "VESTIDO AGUSTINA", "VESTIDO AKIABARA", "VESTIDO ALEXIA",
    "VESTIDO AMBAR", "VESTIDO ARIANA", "VESTIDO BEBE", "VESTIDO BEBE HEYDI",
    "VESTIDO BRILLO", "VESTIDO CHIKY", "VESTIDO DE FIESTA IMPORTADOS",
    "CAMISA CADARUVE", "CAMISA CADARUVE CF", "CAMISA CADARUVE CLISAS",
    "CAMISA CADARUVE CON ESTAMPA", "CAMISA CADARUVE CR",
    "CAMISA CADARUVE CUELLO MAO DE LINO", "CAMISA BEG", "CAMISA BEG RAYAS",
    "CAMISA BL", "CAMISA BRODERIE 1093", "CAMISA BRODERIE 849", "CAMISA CON BRODERIE",
    "CAMISA LEMOS", "CAMISA LINO", "CAMISA M&C KIDS", "CAMISA MAO", "CAMISA ZAR",
    "CAMISA ZARA", "BUZO ARGENTINA FRIZADO", "BUZO ARGENTINA SIN FRIZA",
    "BUZO CANGURO FRIZADO", "BUZO DARLON MEDIO CIERRE", "BUZO LANILLA",
    "JEANS MOON MAR-24", "JEANS MOON NANLU", "JEANS RECTO MAR-24",
    "SHORT JULIO DEPORTIVO", "SHORT RAMIRO DEPORTIVO", "SHORT THIAGO DEPORTIVO",
    "REMERA DEPORTIVA NIKE", "REMERA DEPORTIVA NIKE LADY", "REMERA MANGA LARGA TUL",
    "ZAPATILLAS BUSS DEPORTIVAS", "ZAPATILLAS BUSS DEPORTIVAS N",
    "ZAPATILLAS CLEBER DEPORTIVAS", "ZAPATILLAS CLEBER DEPORTIVAS AIRZOOM",
  ];
  const pesosEvens = construirPesos(EVENS);
  const enEvens = (remito: string, candidato: string) =>
    evaluarCandidato(remito, candidato, pesosEvens, EVENS.length);

  it("separa las prendas distintas de la familia egresada", () => {
    // Los tres pares que la conciliación fusionó de verdad el 28/8.
    expect(enEvens("VESTIDO EGRESADA ALANA", "VESTIDO EGRESADA ALINA").confianza).toBe("baja");
    expect(enEvens("VESTIDO EGRESADA GEORGINA", "VESTIDO EGRESADA GIORGINA").confianza).toBe("baja");
    expect(enEvens("VESTIDO EGRESADA CARLA", "VESTIDO EGRESADA MORE").confianza).toBe("baja");
  });

  it("separa las camisas CADARUVE entre sí", () => {
    expect(enEvens("CAMISA CADARUVE CF", "CAMISA CADARUVE CR").confianza).toBe("baja");
    expect(enEvens("CAMISA CADARUVE CF", "CAMISA CADARUVE CLISAS").confianza).toBe("baja");
    expect(enEvens("CAMISA BEG", "CAMISA BEG RAYAS").confianza).toBe("alta");
  });

  it("separa los shorts con nombre de persona", () => {
    // El alias contaminado real: "short fer deportivo" quedó apuntando a
    // "SHORT JULIO DEPORTIVO".
    expect(enEvens("SHORT FER DEPORTIVO", "SHORT JULIO DEPORTIVO").confianza).toBe("baja");
    expect(enEvens("SHORT LEO DEPORTIVO", "SHORT JULIO DEPORTIVO").confianza).toBe("baja");
  });

  it("sigue reconociendo el mismo producto escrito distinto", () => {
    expect(enEvens("jeans moon mar 24", "JEANS MOON MAR-24").confianza).toBe("alta");
    expect(enEvens("Camisa Cadaruve", "CAMISA CADARUVE").confianza).toBe("alta");
    expect(enEvens("zapatillas buss deportivas", "ZAPATILLAS BUSS DEPORTIVAS").confianza).toBe("alta");
  });
});

describe("comportamiento en los bordes", () => {
  it("un nombre vacío no rompe", () => {
    expect(evaluar("", "CAMISA CADARUVE").confianza).toBe("baja");
  });

  it("una palabra que no está en el catálogo pesa como única", () => {
    // Es la prenda que entra por primera vez: si el candidato no la tiene, la
    // sugerencia no puede ser confiable.
    const r = evaluar("CAMISA CADARUVE PETROLEO", "CAMISA CADARUVE");
    expect(r.confianza).toBe("baja");
    expect(r.faltantes).toEqual(["petroleo"]);
  });

  it("las palabras faltantes salen de más rara a más común", () => {
    const r = evaluar("VESTIDO EGRESADA ALANA CORTO", "VESTIDO EGRESADA");
    // "alana" y "corto" no están en el catálogo; "vestido" y "egresada" sí y
    // están cubiertas. El orden importa para el aviso de la pantalla.
    expect(r.faltantes).toHaveLength(2);
    expect(r.cobertura).toBeLessThan(0.5);
  });
});
