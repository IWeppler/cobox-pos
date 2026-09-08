import { normalizarBusqueda } from "@/shared/lib/normalizar-busqueda";
import { parseAttributeSegment } from "@/entities/productos/lib/parse-variant-attributes";

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
