import type { Producto } from "@/entities/productos/types";
import { normalizarBusqueda } from "@/shared/lib/normalizar-busqueda";

/**
 * ¿Este producto entra en lo que se está buscando?
 *
 * Función aparte del hook —y no un `useCallback` adentro— porque es una REGLA,
 * no plumbing de React: dice por qué campos se puede encontrar un producto en
 * el POS y en el catálogo. Vivía dentro de `useCatalogFilters` y por lo tanto
 * no se podía probar sin montar un componente (este proyecto corre vitest en
 * `environment: "node"`, sin jsdom). El resultado era que buscar por código de
 * producto —lo que hace el lector de códigos de barras— no tenía una sola
 * prueba.
 *
 * DÓNDE BUSCA, y por qué en esos cuatro:
 *   - nombre: lo obvio.
 *   - marca y modelo: en electro y kiosco son la identidad del producto
 *     ("Yerba La Merced" no se distingue de "Yerba Del Monte" por el nombre).
 *   - SKU de las variantes: es lo que entra cuando alguien ESCANEA. En electro
 *     esa columna guarda el EAN de la unidad; en indumentaria, el código del
 *     modelo, compartido por todos los talles.
 *
 * La comparación va normalizada de los dos lados (ver `normalizarBusqueda`):
 * sin eso, "camion" no encuentra "Camión".
 */
export function coincideConBusqueda(
  producto: Pick<Producto, "nombre" | "marca" | "modelo" | "producto_variantes">,
  consulta: string,
): boolean {
  const query = normalizarBusqueda(consulta);

  // Sin búsqueda entran todos: es el estado inicial de la grilla, no un filtro
  // que no matchea nada.
  if (!query) return true;

  const enTexto = (valor: string | null | undefined) =>
    normalizarBusqueda(valor ?? "").includes(query);

  return (
    enTexto(producto.nombre) ||
    enTexto(producto.marca) ||
    enTexto(producto.modelo) ||
    (producto.producto_variantes?.some((variante) => enTexto(variante.sku)) ??
      false)
  );
}
