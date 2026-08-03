import { formatearMoneda } from "@/shared/utils/formatters";

/**
 * Título y descripción del preview de un link `?productos=...`.
 *
 * Lo que se comparte por WhatsApp es, casi siempre, una selección armada a
 * mano para UNA clienta ("mirá estos tres"). El preview tiene que decir qué
 * hay adentro: un genérico "Productos seleccionados" no distingue un link de
 * otro y no invita a abrirlo.
 *
 * Con un solo producto el link se comporta como el de producto individual
 * (nombre + precio); con varios, nombra los primeros y cuenta el resto.
 */

/** Tope de la meta description: más que esto lo cortan los scrapers. */
const MAX_DESCRIPCION = 160;

/** Cuántos nombres se listan antes de pasar a "y N más". */
const NOMBRES_EN_DESCRIPCION = 3;

export interface ProductoSeleccionado {
  nombre: string;
  precio?: number | null;
}

export interface DescripcionSeleccion {
  title: string;
  description: string;
}

function recortar(texto: string): string {
  if (texto.length <= MAX_DESCRIPCION) return texto;
  return `${texto.slice(0, MAX_DESCRIPCION - 1).trimEnd()}…`;
}

export function describirSeleccion(
  seleccionados: ProductoSeleccionado[],
  nombreComercio: string,
): DescripcionSeleccion {
  // Sin productos resueltos (ids borrados, despublicados, link manipulado) se
  // mantiene el texto genérico: es el único caso donde el fallback es correcto.
  if (seleccionados.length === 0) {
    return {
      title: `Productos seleccionados | ${nombreComercio}`,
      description: `Mirá esta selección de productos de ${nombreComercio}.`,
    };
  }

  if (seleccionados.length === 1) {
    const [producto] = seleccionados;
    const precio =
      typeof producto.precio === "number"
        ? `${formatearMoneda(producto.precio)}. `
        : "";

    return {
      title: `${producto.nombre} | ${nombreComercio}`,
      description: recortar(
        `${precio}Comprá ${producto.nombre} en ${nombreComercio}.`,
      ),
    };
  }

  const nombres = seleccionados.map((p) => p.nombre);
  const listados = nombres.slice(0, NOMBRES_EN_DESCRIPCION).join(", ");
  const restantes = nombres.length - NOMBRES_EN_DESCRIPCION;
  const detalle = restantes > 0 ? `${listados} y ${restantes} más` : listados;

  return {
    title: `${seleccionados.length} productos seleccionados | ${nombreComercio}`,
    description: recortar(`${detalle} — selección de ${nombreComercio}.`),
  };
}
