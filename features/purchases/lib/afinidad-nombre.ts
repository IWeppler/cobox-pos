import { normalizarBusqueda } from "@/shared/lib/normalizar-busqueda";

/**
 * Cuánta confianza merece el producto que el sistema sugiere como "este ya lo
 * tenías cargado".
 *
 * EL PROBLEMA (Evens, 8/9/2026). `sugerir_productos_similares` puntúa por
 * trigramas: cuenta cuántos pedacitos de tres letras comparten los dos
 * nombres. Con familias de nombre largo eso hace agua, porque el prefijo
 * repetido es casi todo el nombre:
 *
 *   "VESTIDO EGRESADA ALANA" vs "VESTIDO EGRESADA ALINA" → 0,77
 *   "VESTIDO EGRESADA ALANA" vs "VESTIDO EGRESADA AMBAR" → 0,64
 *   "CAMISA CADARUVE CF"     vs "CAMISA CADARUVE"        → 0,88
 *
 * Todos pasan el umbral de 0,60, así que la pantalla ofrecía con el mismo
 * botón azul una asociación correcta y una que fusiona dos prendas distintas.
 * Y lo que distingue a esas prendas es justamente lo que el trigrama diluye:
 * las dos últimas letras.
 *
 * LA IDEA. No todas las palabras informan lo mismo. En un catálogo de
 * indumentaria, "vestido" aparece en cientos de productos y no dice nada;
 * "alana" aparece en uno y es TODO lo que dice. Se le da a cada palabra un
 * peso inverso a cuántas veces aparece en el catálogo —lo mismo que hace un
 * buscador— y se mide qué proporción del PESO del nombre del remito está
 * cubierta por el candidato.
 *
 * Si las palabras comunes coinciden pero la rara no, la cobertura se derrumba
 * y la sugerencia pasa a "confianza baja": se sigue mostrando —el objetivo de
 * la función es que no tengas que acordarte de lo que ya cargaste— pero la
 * pantalla la presenta como una pregunta y no como una recomendación.
 *
 * NO reemplaza al trigrama: lo ordena. El candidato lo sigue eligiendo la RPC,
 * que es la que puede recorrer el catálogo entero en la base; esto se aplica
 * arriba, con el catálogo que la conciliación ya tiene en memoria.
 */

export type Confianza = "alta" | "baja";

export interface EvaluacionCandidato {
  confianza: Confianza;
  /** 0 a 1: qué proporción del peso del nombre del remito cubre el candidato. */
  cobertura: number;
  /** Palabras del remito que el candidato NO tiene, de más rara a más común. */
  faltantes: string[];
  /** Palabras del candidato que el remito no tiene. */
  sobrantes: string[];
}

/**
 * Cobertura mínima para tratar la sugerencia como recomendación.
 *
 * 0,75 sale de los casos reales: "VESTIDO EGRESADA ALANA" contra "ALINA" da
 * 0,53 (dos palabras comunes de tres, y la única que identifica no coincide);
 * un nombre repetido con otra grafía —"buzo frisado negro" contra "BUZO
 * FRISADO NEGRO"— da 1. El valle entre los dos casos es ancho, así que el
 * número exacto no es delicado.
 */
const COBERTURA_CONFIABLE = 0.75;

export function tokenizarNombre(nombre: string): string[] {
  return normalizarBusqueda(nombre)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Peso de cada palabra según lo rara que sea en el catálogo. Una palabra que
 * está en la mitad de los productos casi no aporta; una que está en uno solo,
 * aporta todo.
 *
 * Se construye UNA vez por pantalla y se reusa para todas las filas: recorre
 * el catálogo entero (1.606 productos en Evens) y hacerlo por fila sería
 * recorrerlo 43 veces en un remito mediano.
 */
export function construirPesos(nombresCatalogo: string[]): Map<string, number> {
  const documentos = Math.max(1, nombresCatalogo.length);
  const apariciones = new Map<string, number>();

  for (const nombre of nombresCatalogo) {
    for (const token of new Set(tokenizarNombre(nombre))) {
      apariciones.set(token, (apariciones.get(token) ?? 0) + 1);
    }
  }

  const pesos = new Map<string, number>();
  for (const [token, veces] of apariciones) {
    pesos.set(token, Math.log(documentos / (1 + veces)) + 1);
  }
  return pesos;
}

/**
 * Peso de una palabra que no está en el catálogo: es única por definición, así
 * que se le da el máximo. Es el caso de la prenda que entra por primera vez.
 */
function pesoDe(token: string, pesos: Map<string, number>, documentos: number): number {
  return pesos.get(token) ?? Math.log(Math.max(1, documentos)) + 1;
}

export function evaluarCandidato(
  nombreRemito: string,
  nombreCandidato: string,
  pesos: Map<string, number>,
  totalProductos: number,
): EvaluacionCandidato {
  const delRemito = [...new Set(tokenizarNombre(nombreRemito))];
  const delCandidato = new Set(tokenizarNombre(nombreCandidato));

  if (delRemito.length === 0) {
    return { confianza: "baja", cobertura: 0, faltantes: [], sobrantes: [] };
  }

  let pesoTotal = 0;
  let pesoCubierto = 0;
  const faltantes: { token: string; peso: number }[] = [];

  for (const token of delRemito) {
    const peso = pesoDe(token, pesos, totalProductos);
    pesoTotal += peso;
    if (delCandidato.has(token)) {
      pesoCubierto += peso;
    } else {
      faltantes.push({ token, peso });
    }
  }

  const cobertura = pesoTotal > 0 ? pesoCubierto / pesoTotal : 0;

  return {
    confianza: cobertura >= COBERTURA_CONFIABLE ? "alta" : "baja",
    cobertura,
    faltantes: faltantes.sort((a, b) => b.peso - a.peso).map((f) => f.token),
    sobrantes: [...delCandidato].filter((t) => !delRemito.includes(t)),
  };
}
