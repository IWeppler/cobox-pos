import type { Producto } from "@/entities/productos/types";
import { parseProductImages } from "@/features/stock/lib/stock-product-utils";
import { DEFAULT_TIPO } from "../hooks/use-catalog-filters";

/**
 * Portada del catálogo público.
 *
 * El problema que resuelve: en la home se mostraban los filtros de variante
 * calculados sobre TODO el catálogo. En un local de indumentaria eso son todos
 * los talles y todos los colores de todos los productos juntos — ilegible, y
 * además inútil (nadie filtra por "rojo" sin haber elegido antes qué busca).
 *
 * La portada muestra categorías + recién llegados, y los filtros aparecen
 * recién adentro de una categoría, donde el conjunto de talles y colores ya
 * está acotado a algo que se puede leer.
 */

/** Cuántos productos entran en "Recién llegados". */
export const CANTIDAD_RECIEN_LLEGADOS = 8;

/** Param que fuerza la grilla completa con filtros desde la portada. */
export const PARAM_VER_TODO = "ver";
export const VALOR_VER_TODO = "todo";

/**
 * ¿Corresponde mostrar la portada?
 *
 * Cualquier intención explícita del visitante (buscar, entrar a una categoría,
 * filtrar, abrir un link compartido, o pedir "ver todo") gana sobre la
 * portada: en todos esos casos hay una consulta concreta que responder con la
 * grilla, no con la home.
 */
export function esModoPortada(params: {
  modoSeleccion: boolean;
  tipo: string;
  searchQuery: string;
  verTodo: boolean;
  cantidadFiltrosVariante: number;
}): boolean {
  const { modoSeleccion, tipo, searchQuery, verTodo, cantidadFiltrosVariante } =
    params;

  if (modoSeleccion) return false;
  if (verTodo) return false;
  if (searchQuery.trim() !== "") return false;
  if (tipo !== DEFAULT_TIPO) return false;
  if (cantidadFiltrosVariante > 0) return false;

  return true;
}

/**
 * Los últimos ingresos.
 *
 * Recibe productos YA filtrados por stock/visibilidad (los que devuelve
 * useCatalogFilters), así que acá sólo se ordena y se recorta: duplicar el
 * criterio de visibilidad haría que la portada muestre algo que la grilla
 * esconde.
 *
 * Ordena por `creado_en` descendente. Los que no tienen fecha van al final en
 * vez de mezclarse arriba, que es lo que pasaba al tratarlos como epoch 0
 * dentro de un sort ascendente.
 */
export function recienLlegados(
  productos: Producto[],
  limite: number = CANTIDAD_RECIEN_LLEGADOS,
): Producto[] {
  const conFecha = (p: Producto) => {
    const t = new Date(p.creado_en || 0).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  return [...productos].sort((a, b) => conFecha(b) - conFecha(a)).slice(0, limite);
}

/** Primera imagen usable de un producto, priorizando la versión chica. */
export function imagenDePortada(producto: Producto): string | null {
  return (
    parseProductImages(producto.grid_url)[0] ||
    parseProductImages(producto.thumbnail_url)[0] ||
    parseProductImages(producto.imagen_url)[0] ||
    null
  );
}

export type EntradaPortada = {
  id: string;
  nombre: string;
  count: number;
  imagen: string | null;
};

/**
 * Arma las tarjetas de categoría de la portada.
 *
 * `idsPorEntrada` mapea cada tarjeta a los ids que la componen: una categoría
 * padre no tiene productos propios (viven en sus hijos), así que su portada
 * tiene que buscar imagen entre los productos de toda la rama. Es el mismo
 * criterio que ya usa generateMetadata para elegir la imagen de preview.
 *
 * `resolverCategoriaId` se recibe de afuera a propósito: es la función del
 * hook, que ya sabe resolver tanto `categoria_id` real como el `tipo` legacy
 * de texto libre. Reimplementarla acá sería tener dos verdades.
 */
export function construirPortadaCategorias(params: {
  entradas: {
    id: string;
    nombre: string;
    count: number;
    idsRama: string[];
    /** Portada elegida a mano en Configuración → Categorías. Gana siempre. */
    imagenConfigurada?: string | null;
  }[];
  productos: Producto[];
  resolverCategoriaId: (p: Producto) => string;
}): EntradaPortada[] {
  const { entradas, productos, resolverCategoriaId } = params;

  // Un solo recorrido: por cada id de categoría, la primera imagen encontrada.
  const imagenPorCategoria = new Map<string, string>();
  for (const producto of productos) {
    const catId = resolverCategoriaId(producto);
    if (imagenPorCategoria.has(catId)) continue;
    const imagen = imagenDePortada(producto);
    if (imagen) imagenPorCategoria.set(catId, imagen);
  }

  return entradas
    .filter((e) => e.count > 0)
    .map((entrada) => ({
      id: entrada.id,
      nombre: entrada.nombre,
      count: entrada.count,
      // La portada configurada a mano gana sobre la deducida de los
      // productos: es una decisión del comercio, no un fallback.
      imagen:
        entrada.imagenConfigurada?.trim() ||
        entrada.idsRama
          .map((id) => imagenPorCategoria.get(id))
          .find((url): url is string => Boolean(url)) ||
        null,
    }));
}
