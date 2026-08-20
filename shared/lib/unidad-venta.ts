import {
  ABREVIATURA_UNIDAD,
  normalizarUnidadMedida,
  type UnidadMedida,
} from "./fiscal-producto";
import { parsearCantidadEs } from "./parsear-numero-es";

/**
 * Qué cantidad es válida para vender, según la unidad del producto.
 *
 * Existe como módulo propio y compartido —POS, carrito, create-sale, stock—
 * por el mismo motivo que `determinar-comprobante.ts`: la pregunta "¿este
 * producto se puede vender de a 0,75?" tiene que tener UNA sola respuesta.
 * Dos funciones que la contestan con distinta información terminan en dos
 * respuestas distintas, y acá la diferencia es mercadería que sale del
 * inventario.
 *
 * La capacidad es del PRODUCTO (`productos.unidad_medida`), no del rubro ni
 * del comercio. Un kiosco vende la gaseosa por unidad y los caramelos por
 * 100 g, en el mismo mostrador y en el mismo ticket. Si esto fuera un flag del
 * comercio, ese kiosco tendría que tipear "1,000" para cobrar una Coca.
 */

/**
 * Unidades que admiten fracción. `UNIDAD` y `PAR` no: media remera no existe y
 * medio par de zapatillas tampoco.
 */
const UNIDADES_FRACCIONABLES: ReadonlySet<UnidadMedida> = new Set<UnidadMedida>(
  ["KG", "GRAMO", "LITRO", "METRO"],
);

/** Decimales que guarda la base (`numeric(12,3)`). Tres cubre el gramo, que es
 * la resolución de cualquier balanza comercial. */
export const DECIMALES_CANTIDAD = 3;

/** Techo de `numeric(12,3)`, para que un valor absurdo rebote acá y no como un
 * error de Postgres con la clienta en el mostrador. */
const CANTIDAD_MAXIMA = 999_999_999.999;

export function esFraccionable(unidad: unknown): boolean {
  return UNIDADES_FRACCIONABLES.has(normalizarUnidadMedida(unidad));
}

/** El salto de los botones +/- y el mínimo vendible. Un producto por peso
 * arranca en 1 gramo; uno por unidad, en 1. */
export function pasoCantidad(unidad: unknown): number {
  return esFraccionable(unidad) ? 0.001 : 1;
}

export function redondearCantidad(valor: number): number {
  const factor = 10 ** DECIMALES_CANTIDAD;
  return Math.round(valor * factor) / factor;
}

/**
 * Valida y normaliza una cantidad que viene del cliente.
 *
 * Devuelve `null` cuando NO se puede vender, y el llamador decide qué error
 * mostrar. Es fail-closed a propósito: lo que no se entiende no se vende.
 *
 * Rechaza, en este orden:
 *  - lo que no es un número finito (NaN, Infinity, texto, null)
 *  - cero y negativos — una cantidad negativa en el carrito no es un error de
 *    tipeo, es un request modificado: `create-sale` la usa como `-cantidad`
 *    para descontar stock, así que en negativo AGREGA stock y baja el total
 *  - decimales en un producto que no es fraccionable (0,5 remeras)
 *  - lo que excede el techo de la columna
 */
export function normalizarCantidadVendible(
  valor: unknown,
  unidad: unknown,
): number | null {
  const numero = typeof valor === "number" ? valor : Number(valor);

  if (!Number.isFinite(numero)) return null;
  if (numero <= 0) return null;
  if (numero > CANTIDAD_MAXIMA) return null;

  const redondeada = redondearCantidad(numero);
  // El redondeo puede dejar en cero una cantidad positiva pero más chica que
  // un gramo (0,0004). Vender "cero" no es vender.
  if (redondeada <= 0) return null;

  if (!esFraccionable(unidad) && !Number.isInteger(redondeada)) return null;

  return redondeada;
}

/**
 * Cantidad tipeada en un formulario o traída de una planilla.
 *
 * Reemplaza a los `Number.parseInt` que había repartidos por las pantallas de
 * carga. Ese parseInt no era un redondeo: `parseInt("12,5")` devuelve 12 y
 * `parseInt("0,75")` devuelve 0, o sea que la carga por peso entraba mal y sin
 * un solo aviso.
 *
 * Acepta coma o punto como decimal (`parsearCantidadEs`) y cae al `fallback`
 * cuando el texto no es un número: nunca lanza, porque estos llamadores están
 * en el medio de un formulario que tiene que poder seguir.
 */
export function parsearCantidadDeEntrada(valor: unknown, fallback = 0): number {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? redondearCantidad(valor) : fallback;
  }
  if (typeof valor !== "string") return fallback;

  const parseado = parsearCantidadEs(valor);
  return parseado === null ? fallback : redondearCantidad(parseado);
}

/**
 * Sufijo del PRECIO: "/kg" en lo que se vende por peso, vacío en lo que se
 * vende por pieza.
 *
 * Va vacío y no "/u." en los productos por unidad a propósito: "$12.000" en
 * una remera ya se entiende, y "/u." en toda la grilla de una tienda de ropa
 * es ruido en 1.765 productos para aclarar algo que nadie estaba dudando. En
 * una carnicería, en cambio, "$8.500" sin el "/kg" no es un precio incompleto:
 * es un precio equivocado.
 */
export function sufijoPrecioPorUnidad(unidad: unknown): string {
  const normalizada = normalizarUnidadMedida(unidad);
  return esFraccionable(normalizada)
    ? `/${ABREVIATURA_UNIDAD[normalizada]}`
    : "";
}

/**
 * Cómo se escribe la cantidad en el ticket, el carrito y el inventario.
 *
 * Por unidad se muestra sin decimales ("3 u."); por peso, con los que tenga y
 * sin ceros de relleno ("0,75 kg" y no "0,750 kg"). El separador es coma
 * porque es un número que lee una vendedora en Argentina, no un dato de API.
 */
export function formatearCantidad(cantidad: number, unidad: unknown): string {
  const unidadNormalizada = normalizarUnidadMedida(unidad);
  return `${formatearNumeroCantidad(cantidad, unidadNormalizada)} ${ABREVIATURA_UNIDAD[unidadNormalizada]}`;
}

/** Solo el número, sin la unidad. Para las pantallas que maquetan la
 * abreviatura aparte (Inventario la muestra más chica y en versalitas). */
export function formatearNumeroCantidad(
  cantidad: number,
  unidad: unknown,
): string {
  return esFraccionable(unidad)
    ? redondearCantidad(cantidad).toLocaleString("es-AR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: DECIMALES_CANTIDAD,
      })
    : String(Math.round(cantidad));
}
