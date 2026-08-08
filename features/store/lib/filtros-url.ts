import { normalizarParaComparar } from "@/entities/productos/lib/parse-variant-attributes";

/**
 * Filtros de variante multi-valor en la URL.
 *
 * Formato: `?color=Azul,Negro&talle=M`. Se eligió coma y un solo parámetro por
 * propiedad (en vez de repetir `?color=Azul&color=Negro`) porque los links del
 * catálogo se comparten por WhatsApp y ahí una URL corta importa.
 *
 * Compatible hacia atrás: un link viejo con un solo valor (`?color=Azul`)
 * parsea a un array de uno y filtra exactamente igual que antes.
 */

/** Separador de valores dentro de un mismo parámetro. */
const SEPARADOR = ",";

/**
 * Lee un parámetro multi-valor.
 *
 * Descarta vacíos y duplicados. La deduplicación es tolerante a mayúsculas y
 * acentos para que `?color=Marrón,marron` no muestre el chip dos veces, pero
 * conserva la forma original del primero: es la que tiene que matchear contra
 * las opciones que se muestran.
 */
export function parsearValoresFiltro(valorCrudo: string | null): string[] {
  if (!valorCrudo) return [];

  const vistos = new Set<string>();
  const resultado: string[] = [];

  for (const parte of valorCrudo.split(SEPARADOR)) {
    const valor = parte.trim();
    if (!valor) continue;
    const clave = normalizarParaComparar(valor);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(valor);
  }

  return resultado;
}

/** Serializa para la URL. Devuelve null cuando no queda nada (borra el param). */
export function serializarValoresFiltro(valores: string[]): string | null {
  const limpios = parsearValoresFiltro(valores.join(SEPARADOR));
  return limpios.length > 0 ? limpios.join(SEPARADOR) : null;
}

/**
 * Agrega o saca un valor de la selección de una propiedad.
 *
 * Es toggle: tocar una opción ya elegida la desmarca. Sin esto, la única forma
 * de sacar un color sería el botón de limpiar todo.
 */
export function alternarValorFiltro(
  seleccionActual: string[],
  valor: string,
): string[] {
  const clave = normalizarParaComparar(valor);
  const estaba = seleccionActual.some((v) => normalizarParaComparar(v) === clave);

  return estaba
    ? seleccionActual.filter((v) => normalizarParaComparar(v) !== clave)
    : [...seleccionActual, valor];
}

export function estaSeleccionado(
  seleccionActual: string[],
  valor: string,
): boolean {
  const clave = normalizarParaComparar(valor);
  return seleccionActual.some((v) => normalizarParaComparar(v) === clave);
}

/**
 * Orden en que se muestran las secciones del panel de filtros.
 *
 * Talle va ÚLTIMO a propósito: es la lista más larga (un local de indumentaria
 * tiene 10-15 talles) y arriba empujaba todo lo demás fuera de la pantalla,
 * sobre todo en mobile. Género y Color son listas cortas y son por donde la
 * gente empieza a filtrar.
 *
 * No se toca ORDEN_PRIORIDAD de buildPropiedadesFiltro porque ese orden lo
 * comparten /stock y la ficha de producto, donde Talle antes que Color sí es
 * lo que corresponde.
 */
const PRIORIDAD_SECCION: Record<string, number> = {
  genero: 0,
  color: 1,
  talle: 90,
};

export function ordenarSeccionesFiltro(
  propiedades: [string, string[]][],
): [string, string[]][] {
  return [...propiedades].sort(([a], [b]) => {
    const pa = PRIORIDAD_SECCION[normalizarParaComparar(a)] ?? 50;
    const pb = PRIORIDAD_SECCION[normalizarParaComparar(b)] ?? 50;
    return pa - pb || a.localeCompare(b);
  });
}

/** Cuántos filtros de variante hay puestos, sumando todas las propiedades. */
export function contarFiltrosAplicados(
  filtros: Record<string, string[]>,
): number {
  return Object.values(filtros).reduce((total, v) => total + v.length, 0);
}

/** Opción del selector de orden. Vivía en CatalogToolbar, que quedó reemplazado
 * por el aside + BarraCatalogo. */
export interface OrdenOption {
  value: string;
  label: string;
}
