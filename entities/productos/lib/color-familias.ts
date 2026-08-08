import { normalizarParaComparar } from "./parse-variant-attributes";

/**
 * Familias de color para el filtro del catálogo público.
 *
 * El problema: en Evens hay ~300 valores distintos de color cargados a mano.
 * Entre sinónimos ("rosa", "rosado", "rosada"), tonos ("rosa viejo", "rosa
 * bebé", "rosa chicle"), combinaciones ("blanco/negro", "azul con bigote"),
 * marcas y motivos ("negro nike", "azul spider") y typos reales ("asul",
 * "amarrillo", "biege", "cholate", "verede") el filtro de color era una lista
 * ilegible de trescientas entradas.
 *
 * Esto es una capa de PRESENTACIÓN, no una normalización de datos: no toca
 * `producto_variantes.atributos` ni nada guardado. El valor crudo se sigue
 * mostrando tal cual en la ficha del producto, que es donde el detalle importa
 * ("rosa viejo" y "rosa chicle" no son lo mismo para quien ya eligió el
 * producto). Lo que se agrupa es sólo el filtro de la grilla.
 *
 * Si mañana se quiere normalizar de verdad los datos, el camino es
 * normalizarAtributoKeyValor / canonicalizarValores, no este módulo.
 */

export type FamiliaColor = {
  clave: string;
  /** Lo que se muestra: en el filtro va la muestra de color, esto es su nombre
   * accesible y su tooltip. */
  etiqueta: string;
  /** Color de la muestra. `null` = se dibuja el degradado de multicolor. */
  hex: string | null;
  /** Formas exactas que caen en esta familia, ya normalizadas (sin acentos,
   * minúsculas). Salen de los valores reales del catálogo. */
  sinonimos: string[];
};

/**
 * El orden es el que se ve en el filtro: primero los neutros (que son los que
 * más stock tienen), después el espectro de cálido a frío, y al final los
 * metalizados y los estampados.
 */
export const FAMILIAS_COLOR: FamiliaColor[] = [
  {
    clave: "negro",
    etiqueta: "Negro",
    hex: "#18181b",
    sinonimos: ["negro", "negra", "negros", "negras"],
  },
  {
    clave: "blanco",
    etiqueta: "Blanco",
    hex: "#ffffff",
    sinonimos: ["blanco", "blanca", "blancos", "blancas"],
  },
  {
    clave: "gris",
    etiqueta: "Gris",
    hex: "#9ca3af",
    sinonimos: [
      "gris",
      "grises",
      "melange",
      "gaspeado",
      "cemento",
      "plomo",
      "topo",
    ],
  },
  {
    clave: "beige",
    etiqueta: "Beige",
    hex: "#e0d3bd",
    sinonimos: [
      "beige",
      "crudo",
      "hueso",
      "natural",
      "arena",
      "manteca",
      "crema",
      "nude",
      "camel",
      "vizon",
      "champagne",
      "nougat",
      "tostado",
      "suela",
      "duna",
    ],
  },
  {
    clave: "marron",
    etiqueta: "Marrón",
    hex: "#7c4a24",
    sinonimos: [
      "marron",
      "chocolate",
      "caramelo",
      "terracota",
      "ladrillo",
      "oxido",
      "caqui",
      "cafe",
      "nut",
      "compton",
    ],
  },
  {
    clave: "rojo",
    etiqueta: "Rojo",
    hex: "#dc2626",
    sinonimos: ["rojo", "roja", "rojos", "rojas", "colorado", "colorada"],
  },
  {
    clave: "bordo",
    etiqueta: "Bordó",
    hex: "#7f1d2e",
    sinonimos: ["bordo", "borra vino", "vino", "burdeos"],
  },
  {
    clave: "rosa",
    etiqueta: "Rosa",
    hex: "#f9a8d4",
    sinonimos: [
      "rosa",
      "rosado",
      "rosada",
      "fucsia",
      "magenta",
      "coral",
      "salmon",
      "frutilla",
      "fresa",
      "chicle",
      "pomelo",
    ],
  },
  {
    clave: "naranja",
    etiqueta: "Naranja",
    hex: "#f97316",
    sinonimos: ["naranja", "durazno", "mandarina", "zanahoria"],
  },
  {
    clave: "amarillo",
    etiqueta: "Amarillo",
    hex: "#facc15",
    sinonimos: ["amarillo", "amarilla", "mostaza", "maiz", "canario"],
  },
  {
    clave: "verde",
    etiqueta: "Verde",
    hex: "#16a34a",
    sinonimos: ["verde", "oliva", "lima", "menta", "militar", "loro", "musgo"],
  },
  {
    clave: "celeste",
    etiqueta: "Celeste",
    hex: "#7dd3fc",
    sinonimos: ["celeste", "aqua", "turquesa", "cielo"],
  },
  {
    clave: "azul",
    etiqueta: "Azul",
    hex: "#2563eb",
    sinonimos: ["azul", "marino", "petroleo", "denim", "jean"],
  },
  {
    clave: "violeta",
    etiqueta: "Violeta",
    hex: "#7c3aed",
    sinonimos: ["violeta", "lila", "lavanda", "purpura", "morado", "uva"],
  },
  {
    clave: "dorado",
    etiqueta: "Dorado",
    hex: "#c9a227",
    sinonimos: ["dorado", "dorada", "oro", "cobre", "bronce"],
  },
  {
    clave: "plateado",
    etiqueta: "Plateado",
    hex: "#c0c4cc",
    sinonimos: ["plateado", "plateada", "plata", "platino"],
  },
  {
    clave: "estampado",
    etiqueta: "Estampado",
    hex: null,
    sinonimos: [
      "estampado",
      "estampada",
      "estampados",
      "estampadas",
      "rayado",
      "rayada",
      "raya",
      "rayas",
      "animal print",
      "print",
      "cebra",
      "vaca",
      "vaquita",
      "reptil",
      "cuadrille",
      "cuadrille",
      "batik",
      "tie dye",
      "surtido",
      "surtidos",
      "varios",
      "multicolor",
      "floreado",
      "flores",
      "lunares",
    ],
  },
];

/** Clave de la familia que junta lo que no se pudo clasificar. */
export const CLAVE_OTROS = "otros";
export const ETIQUETA_OTROS = "Otros";

export const FAMILIA_OTROS: FamiliaColor = {
  clave: CLAVE_OTROS,
  etiqueta: ETIQUETA_OTROS,
  hex: null,
  sinonimos: [],
};

/** ¿Esta propiedad de variante es un color? */
export function esPropiedadColor(nombrePropiedad: string): boolean {
  return normalizarParaComparar(nombrePropiedad).includes("color");
}

const indicePorSinonimo = new Map<string, FamiliaColor>();
for (const familia of FAMILIAS_COLOR) {
  for (const sinonimo of familia.sinonimos) {
    // El primero gana: si dos familias declaran el mismo sinónimo, manda la
    // que está antes en FAMILIAS_COLOR (orden de prioridad explícito).
    if (!indicePorSinonimo.has(sinonimo)) indicePorSinonimo.set(sinonimo, familia);
  }
}

export function familiaPorClave(clave: string): FamiliaColor | null {
  if (clave === CLAVE_OTROS) return FAMILIA_OTROS;
  return FAMILIAS_COLOR.find((f) => f.clave === clave) ?? null;
}

export function familiaPorEtiqueta(etiqueta: string): FamiliaColor | null {
  const objetivo = normalizarParaComparar(etiqueta);
  if (objetivo === normalizarParaComparar(ETIQUETA_OTROS)) return FAMILIA_OTROS;
  return (
    FAMILIAS_COLOR.find((f) => normalizarParaComparar(f.etiqueta) === objetivo) ??
    null
  );
}

/**
 * Distancia de edición con transposición (Damerau-Levenshtein restringida).
 *
 * Se usa transposición y no Levenshtein pelado porque el typo más común al
 * cargar a mano es justamente intercambiar dos letras: "biege" por "beige",
 * "chocoalte" por "chocolate", "duranzo" por "durazno". En Levenshtein simple
 * esos casos valen 2 y se escapaban del umbral.
 */
export function distanciaEdicion(a: string, b: string): number {
  if (a === b) return 0;
  const filas = a.length + 1;
  const columnas = b.length + 1;
  const d: number[][] = Array.from({ length: filas }, () =>
    new Array<number>(columnas).fill(0),
  );

  for (let i = 0; i < filas; i++) d[i][0] = i;
  for (let j = 0; j < columnas; j++) d[0][j] = j;

  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < columnas; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + costo,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[a.length][b.length];
}

/**
 * Tolerancia al typo según el largo de la palabra. Corta en 4 caracteres: por
 * debajo de eso casi cualquier par está a distancia 1 y se empiezan a mezclar
 * colores distintos.
 */
function toleranciaTypo(palabra: string): number {
  if (palabra.length < 4) return 0;
  if (palabra.length <= 6) return 1;
  return 2;
}

/** Quita plural y femenino: "negras" -> "negra" -> "negro". */
function variantesMorfologicas(palabra: string): string[] {
  const formas = [palabra];
  if (palabra.endsWith("s") && palabra.length > 3) {
    formas.push(palabra.slice(0, -1));
  }
  for (const forma of [...formas]) {
    if (forma.endsWith("a")) formas.push(`${forma.slice(0, -1)}o`);
  }
  return formas;
}

const SEPARADORES = /\s*(?:\/|\||,|\+|\band\b|\bcon\b|\by\b|\bcombinad[oa]\b)\s*/;

function buscarExacto(texto: string): FamiliaColor | null {
  for (const forma of variantesMorfologicas(texto)) {
    const familia = indicePorSinonimo.get(forma);
    if (familia) return familia;
  }
  return null;
}

function buscarAproximado(palabra: string): FamiliaColor | null {
  const tolerancia = toleranciaTypo(palabra);
  if (tolerancia === 0) return null;

  let mejor: { familia: FamiliaColor; distancia: number } | null = null;
  for (const [sinonimo, familia] of indicePorSinonimo) {
    // Sólo contra sinónimos de una palabra: comparar "azul" contra "animal
    // print" no tiene sentido y suma falsos positivos.
    if (sinonimo.includes(" ")) continue;
    // Diferencias de largo grandes nunca van a entrar en la tolerancia, y
    // saltearlas evita recorrer la matriz al pedo.
    if (Math.abs(sinonimo.length - palabra.length) > tolerancia) continue;

    const distancia = distanciaEdicion(palabra, sinonimo);
    if (distancia <= tolerancia && (!mejor || distancia < mejor.distancia)) {
      mejor = { familia, distancia };
    }
  }
  return mejor?.familia ?? null;
}

/**
 * Familia de un valor de color crudo. `null` cuando no se pudo clasificar —
 * quien llama decide si eso va a "Otros" o se descarta.
 *
 * El orden de las pasadas es lo que hace que ande:
 *  1. La frase completa exacta ("borra vino", "animal print").
 *  2. El PRIMER segmento de una combinación: en "blanco/negro" o "azul con
 *     bigote" el color dominante es el primero, que es como lo lee quien
 *     compra.
 *  3. Palabra por palabra, exacto. Acá caen "verde agua", "rosa viejo",
 *     "gris melange".
 *  4. Recién al final, la búsqueda tolerante a typos. Va última A PROPÓSITO:
 *     "lima" está a distancia 1 de "lila", y son familias distintas. Si el
 *     paso exacto no corriera antes y sobre TODAS las familias, "lima"
 *     (verde) terminaría clasificada como violeta.
 */
export function resolverFamiliaColor(valorCrudo: string): FamiliaColor | null {
  const texto = normalizarParaComparar(valorCrudo ?? "").replace(/\s+/g, " ");
  if (!texto) return null;

  const exactoCompleto = buscarExacto(texto);
  if (exactoCompleto) return exactoCompleto;

  const segmentos = texto.split(SEPARADORES).filter(Boolean);
  const dominante = segmentos[0] ?? texto;

  const exactoDominante = buscarExacto(dominante);
  if (exactoDominante) return exactoDominante;

  const palabrasDominante = dominante.split(" ").filter(Boolean);
  for (const palabra of palabrasDominante) {
    const familia = buscarExacto(palabra);
    if (familia) return familia;
  }

  // Todavía exacto, pero ya mirando el resto de los segmentos: "completas/
  // negras" no tiene color en el primero.
  for (const segmento of segmentos.slice(1)) {
    for (const palabra of segmento.split(" ").filter(Boolean)) {
      const familia = buscarExacto(palabra);
      if (familia) return familia;
    }
  }

  for (const palabra of palabrasDominante) {
    for (const forma of variantesMorfologicas(palabra)) {
      const familia = buscarAproximado(forma);
      if (familia) return familia;
    }
  }

  return null;
}

/**
 * ¿Un valor crudo cae en la familia seleccionada en el filtro?
 *
 * La selección viaja como la ETIQUETA de la familia ("Marrón", "Otros") — es
 * lo que se ve en la URL compartida y lo que devuelve buildPropiedadesFiltro.
 * Comparar contra la etiqueta y no contra la clave evita tener dos
 * representaciones dando vueltas.
 */
export function valorPerteneceAFamilia(
  valorCrudo: string,
  etiquetaFamilia: string,
): boolean {
  const objetivo = familiaPorEtiqueta(etiquetaFamilia);
  if (!objetivo) return false;

  const familia = resolverFamiliaColor(valorCrudo);
  if (!familia) return objetivo.clave === CLAVE_OTROS;
  return familia.clave === objetivo.clave;
}

/**
 * Agrupa una lista de valores crudos en familias, respetando el orden de
 * FAMILIAS_COLOR. "Otros" se agrega al final y sólo si hay algo adentro.
 */
export function agruparValoresPorFamilia(valores: string[]): FamiliaColor[] {
  const presentes = new Set<string>();
  let hayOtros = false;

  for (const valor of valores) {
    const familia = resolverFamiliaColor(valor);
    if (familia) presentes.add(familia.clave);
    else if (valor?.trim()) hayOtros = true;
  }

  const resultado = FAMILIAS_COLOR.filter((f) => presentes.has(f.clave));
  if (hayOtros) resultado.push(FAMILIA_OTROS);
  return resultado;
}
