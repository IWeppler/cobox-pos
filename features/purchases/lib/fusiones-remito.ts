import { normalizarBusqueda } from "@/shared/lib/normalizar-busqueda";
import { parseAttributeSegment } from "@/entities/productos/lib/parse-variant-attributes";
import { construirPesos, evaluarCandidato } from "./afinidad-nombre";

/**
 * Dos renglones del remito que van a terminar en la MISMA variante del MISMO
 * producto, siendo productos distintos para el proveedor.
 *
 * POR QUÉ EXISTE (incidente Evens, 8/9/2026). La dueña cargó vestidos de
 * egresada —prendas únicas, una por color— y el stock le quedó combinado. El
 * matcher por similitud de nombre sugiere mal en esa familia: todos comparten
 * el prefijo "VESTIDO EGRESADA ", así que contra "ALANA" el candidato "ALINA"
 * puntúa 0,77 y hasta "AMBAR" pasa el umbral de 0,60. Nada impedía confirmar
 * varios grupos hacia el mismo producto, y ahí "Talle: U / Color: BORDO" de
 * dos vestidos distintos es la misma variante: el stock se sumaba y el color
 * del segundo pisaba al del primero. En el remito del 28/8, 24 líneas con 24
 * nombres distintos terminaron en 5 productos.
 *
 * QUÉ ES ESTO Y QUÉ NO. Es el aviso TEMPRANO, el que se ve mientras se
 * concilia y todavía se puede corregir con un clic. El freno de verdad está
 * en `aprobar_orden_compra` (`20260908120000`), que rechaza el remito entero
 * antes de escribir una sola fila: una validación de navegador no protege
 * nada por sí sola. Los dos usan el mismo criterio a propósito, así que lo
 * que la pantalla marca en rojo es exactamente lo que la base va a rechazar.
 *
 * La identidad de acá APROXIMA a `atributos_comparables` de la base: mismo
 * espíritu (clave y valor en minúsculas, sin acentos, ordenados por clave),
 * pero sin el cache de canonicalización de valores que corre en el server. La
 * consecuencia está elegida: puede no ver una fusión que la base sí ve
 * —"Marron" contra "MARRÓN" las ve igual, pero dos sinónimos que la
 * canonicalización unifica, no— y por eso la base sigue siendo la autoridad.
 * Al revés no pasa: lo que esto marca, se fusiona.
 */
export interface FusionDetectada {
  productoId: string;
  /** Nombre del producto destino, para poder nombrarlo en el aviso. */
  productoNombre: string;
  /** Cómo se veía la variante en el remito (el primero que llegó). */
  variante: string;
  /** Los nombres del proveedor que caen ahí, en orden de aparición. */
  nombres: string[];
}

export interface LineaRemito {
  raw_nombre: string;
  raw_variante?: string | null;
  variante_match?: string | null;
  producto_id?: string | null;
}

/** Nombres que significan "esta prenda no tiene variantes". */
const VARIANTE_UNICA = new Set(["unico", "único", ""]);

/**
 * Identidad comparable de una variante, en la misma forma que
 * `public.atributos_comparables`: `clave=valor` en minúsculas y sin acentos,
 * unidos por `|` y ordenados por clave.
 *
 * Sin segmentos reconocibles cae al texto completo normalizado, igual que la
 * rama `display:` del guard de la RPC: es lo único que distingue a esa fila.
 */
export function identidadDeVariante(variante: string | null | undefined): string {
  const texto = (variante ?? "").trim();
  if (VARIANTE_UNICA.has(texto.toLowerCase())) return "";

  const pares: string[] = [];
  for (const segmento of texto.split(" / ")) {
    const parsed = parseAttributeSegment(segmento);
    if (parsed) {
      pares.push(
        `${normalizarBusqueda(parsed.nombre)}=${normalizarBusqueda(parsed.valor)}`,
      );
    }
  }

  if (pares.length === 0) return `display:${normalizarBusqueda(texto)}`;
  return pares.sort().join("|");
}

/**
 * Las fusiones que tiene el remito tal como está vinculado ahora.
 *
 * Dos líneas con el MISMO `raw_nombre` no son una fusión: es el remito
 * trayendo la misma prenda en dos renglones, y sumarlas es lo correcto.
 */
export function detectarFusiones(
  lineas: LineaRemito[],
  nombrePorProducto: (productoId: string) => string | undefined,
): FusionDetectada[] {
  const grupos = new Map<
    string,
    { productoId: string; variante: string; nombres: string[] }
  >();

  for (const linea of lineas) {
    if (!linea.producto_id) continue;

    const variante =
      linea.variante_match || linea.raw_variante || "Unico";
    const clave = `${linea.producto_id}::${identidadDeVariante(variante)}`;

    const grupo = grupos.get(clave) ?? {
      productoId: linea.producto_id,
      variante,
      nombres: [],
    };
    if (!grupo.nombres.includes(linea.raw_nombre)) {
      grupo.nombres.push(linea.raw_nombre);
    }
    grupos.set(clave, grupo);
  }

  return Array.from(grupos.values())
    .filter((g) => g.nombres.length > 1)
    .map((g) => ({
      productoId: g.productoId,
      productoNombre: nombrePorProducto(g.productoId) ?? "producto del sistema",
      variante: g.variante,
      nombres: g.nombres,
    }));
}

/**
 * Qué nombres del remito comparten producto, aunque todavía NO choquen en una
 * variante.
 *
 * Compartir producto puede ser correcto —el proveedor escribió el mismo
 * artículo de dos formas— pero es la antesala de la fusión, y en Evens fue lo
 * que pasó: primero se vincularon tres vestidos al mismo producto y recién al
 * aprobar se vio que dos compartían color. Avisarlo mientras se concilia es
 * barato; descubrirlo con el stock ya sumado, no.
 */
export function nombresPorProductoCompartido(
  lineas: LineaRemito[],
): Map<string, string[]> {
  const porProducto = new Map<string, string[]>();

  for (const linea of lineas) {
    if (!linea.producto_id) continue;
    const nombres = porProducto.get(linea.producto_id) ?? [];
    if (!nombres.includes(linea.raw_nombre)) nombres.push(linea.raw_nombre);
    porProducto.set(linea.producto_id, nombres);
  }

  for (const [productoId, nombres] of porProducto) {
    if (nombres.length < 2) porProducto.delete(productoId);
  }

  return porProducto;
}

/**
 * Compartir producto: cuándo es un error y cuándo no.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA ADEMÁS DE `detectarFusiones`
 *
 * `detectarFusiones` solo ve el choque cuando dos nombres caen en la MISMA
 * variante. Eso deja pasar el caso más caro, que es el que pasó de verdad:
 * `VESTIDO EGRESADA MORE` recibió el 28/8 cinco vestidos distintos —11, 212,
 * CARLA, MIKA, RUBY— en colores BORDO, DORADO, CHOCOLATE, ROJO y ROSA. Como
 * ningún color se repetía, NO hubo una sola fusión que detectar: el remito se
 * aprobó sin una queja y cinco prendas distintas quedaron convertidas en
 * variantes de una sola. El stock no se sumó mal; el catálogo quedó mintiendo.
 *
 * Medido sobre los 146 remitos aprobados de los 4 negocios: la señal "un
 * producto recibió más de un nombre del proveedor EN EL MISMO REMITO" da 9
 * casos, y 6 son errores reales (los 5 vestidos y CAMISA CON BRODERIE con 7
 * códigos distintos). Los otros 3 son legítimos, y por eso esto clasifica en
 * vez de bloquear.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ SEPARA UN ERROR DE UNA GRAFÍA
 *
 * Los tres casos legítimos son el mismo artículo escrito de dos formas:
 * `VESTIDO VERA` / `VESTIOD VERA` (un typo del proveedor) y
 * `CONJUNTO IMPERAMBLE ATURE CON PIEL` / el mismo sin `ATURE`. Los seis
 * errores difieren en una palabra que IDENTIFICA a la prenda.
 *
 * La distinción no se inventa acá: es la misma cobertura por peso de
 * `evaluarCandidato`, aplicada entre los dos nombres del remito en lugar de
 * entre el remito y el catálogo. Una palabra rara que está en uno y no en el
 * otro derrumba la cobertura; un typo o una palabra de más, no.
 *
 * Los pesos salen de los nombres DEL REMITO y no del catálogo: acá la pregunta
 * es qué distingue a estas filas entre sí. En una entrega de 24 vestidos de
 * egresada, "vestido" y "egresada" están en todas y no dicen nada, que es
 * exactamente lo que el peso tiene que reflejar.
 */
export interface ProductoCompartido {
  productoId: string;
  productoNombre: string;
  /** Los nombres del remito que caen en ese producto. */
  nombres: string[];
  /**
   * `true` cuando los nombres se parecen tanto que son la misma prenda escrita
   * distinto. Ahí compartir producto es lo correcto y no hay nada que avisar.
   */
  esMismaPrenda: boolean;
}

/**
 * Cobertura por encima de la cual dos nombres del remito son la misma prenda.
 *
 * Se mide en los dos sentidos y se toma la mejor: `CONJUNTO IMPERAMBLE CON
 * PIEL` cubre casi todo `CONJUNTO IMPERAMBLE ATURE CON PIEL` en un sentido y
 * no en el otro, y esa asimetría es justamente la forma de "el mismo artículo
 * con una palabra de más".
 *
 * 0,75 es el mismo número que `COBERTURA_CONFIABLE`, y a propósito: es la
 * misma pregunta —¿estos dos nombres son la misma cosa?— hecha sobre otro par.
 */
const COBERTURA_MISMA_PRENDA = 0.75;

/**
 * En cuántas líneas del remito tiene que aparecer una palabra para tratarla
 * como parte del vocabulario común de esa entrega.
 *
 * Es lo que distingue un typo de un nombre propio, y sin eso la regla no
 * funciona: `VESTIOD` contra `VESTIDO` y `ALANA` contra `ALINA` están a la
 * misma distancia de edición, pero la primera es el error de tipeo de una
 * palabra que está en las otras 23 líneas del remito, y la segunda son dos
 * vestidos distintos donde ninguno de los dos nombres aparece en ningún lado
 * más. Corregir por parecido de letras sin mirar eso fusionaría justo los seis
 * casos que hay que detectar.
 */
const APARICIONES_PALABRA_COMUN = 3;

export function clasificarProductosCompartidos(
  lineas: LineaRemito[],
  nombrePorProducto: (productoId: string) => string | undefined,
): ProductoCompartido[] {
  const porProducto = nombresPorProductoCompartido(lineas);
  if (porProducto.size === 0) return [];

  // Los pesos se construyen una vez, con TODOS los nombres del remito: es el
  // universo contra el que se mide qué palabra es rara.
  const nombresDelRemito = lineas.map((l) => l.raw_nombre);
  const pesos = construirPesos(nombresDelRemito);
  const comunes = palabrasComunes(nombresDelRemito);
  const total = lineas.length;

  return Array.from(porProducto.entries()).map(([productoId, nombres]) => ({
    productoId,
    productoNombre: nombrePorProducto(productoId) ?? "producto del sistema",
    nombres,
    esMismaPrenda: nombres.every((nombre, i) =>
      // Cada nombre contra el primero: si todos son variantes de escritura del
      // mismo, el grupo entero lo es. Comparar todos contra todos no cambia el
      // resultado y cuesta cuadrático.
      i === 0 ? true : sonLaMismaPrenda(nombres[0], nombre, pesos, comunes, total),
    ),
  }));
}

/** Las palabras que se repiten en el remito: el "vestido" de una entrega de vestidos. */
function palabrasComunes(nombres: string[]): Set<string> {
  const veces = new Map<string, number>();
  for (const nombre of nombres) {
    for (const token of new Set(tokenizar(nombre))) {
      veces.set(token, (veces.get(token) ?? 0) + 1);
    }
  }
  return new Set(
    [...veces].filter(([, n]) => n >= APARICIONES_PALABRA_COMUN).map(([t]) => t),
  );
}

function tokenizar(nombre: string): string[] {
  return normalizarBusqueda(nombre)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Distancia de edición, con tope: alcanza con saber si es chica.
 * Cuenta la transposición como UNA operación (Damerau), porque el typo más
 * común al tipear rápido es justamente cambiar dos letras de lugar —
 * `VESTIOD` por `VESTIDO`.
 */
function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;

  const filas: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      filas[i][j] = Math.min(
        filas[i - 1][j] + 1,
        filas[i][j - 1] + 1,
        filas[i - 1][j - 1] + costo,
      );
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
      ) {
        filas[i][j] = Math.min(filas[i][j], filas[i - 2][j - 2] + 1);
      }
    }
  }

  return filas[a.length][b.length];
}

/**
 * Reescribe el nombre corrigiendo los typos de palabras COMUNES del remito.
 *
 * Solo toca una palabra cuando su gemela común está a una edición de
 * distancia, y solo en palabras de 5 letras o más: con menos, "849" y "850" o
 * "11" y "12" estarían a una edición, y son artículos distintos.
 */
function corregirTypos(nombre: string, comunes: Set<string>): string[] {
  return tokenizar(nombre).map((token) => {
    if (comunes.has(token) || token.length < 5) return token;

    for (const comun of comunes) {
      if (comun.length >= 5 && distancia(token, comun, 1) <= 1) return comun;
    }
    return token;
  });
}

function sonLaMismaPrenda(
  a: string,
  b: string,
  pesos: Map<string, number>,
  comunes: Set<string>,
  total: number,
): boolean {
  const limpioA = corregirTypos(a, comunes).join(" ");
  const limpioB = corregirTypos(b, comunes).join(" ");

  // En los dos sentidos y se toma el mejor: "CONJUNTO IMPERAMBLE CON PIEL"
  // está contenido en "CONJUNTO IMPERAMBLE ATURE CON PIEL" pero no al revés, y
  // esa asimetría ES la forma de "el mismo artículo con una palabra de más".
  const ab = evaluarCandidato(limpioA, limpioB, pesos, total).cobertura;
  const ba = evaluarCandidato(limpioB, limpioA, pesos, total).cobertura;
  return Math.max(ab, ba) >= COBERTURA_MISMA_PRENDA;
}
