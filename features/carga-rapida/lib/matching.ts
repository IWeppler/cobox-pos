import { Producto, ProductoVariante } from "@/entities/productos/types";

export function normalizarQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export type MatchSku = {
  producto: Producto;
  variante: ProductoVariante;
};

/** Match exacto (case-insensitive) de SKU/código de barras contra
 * producto_variantes.sku. El mismo código de proveedor identifica el
 * modelo/estilo, no una variante puntual — es normal que matchee varias
 * filas de distinto talle/color. Devuelve TODOS los matches; quien llama
 * decide cómo desambiguar (no se toma "el primero" silenciosamente). */
export function matchSkuExacto(productos: Producto[], query: string): MatchSku[] {
  const normalizado = normalizarQuery(query);
  if (!normalizado) return [];

  const matches: MatchSku[] = [];
  for (const producto of productos) {
    for (const variante of producto.producto_variantes ?? []) {
      if (variante.sku && normalizarQuery(variante.sku) === normalizado) {
        matches.push({ producto, variante });
      }
    }
  }

  return matches;
}

/** Búsqueda por nombre — mismo filtro substring case-insensitive que ya
 * usa features/stock/ui/stock-view.tsx, no una librería de fuzzy nueva. */
export function matchPorNombre(
  productos: Producto[],
  query: string,
): Producto[] {
  const normalizado = normalizarQuery(query);
  if (!normalizado) return [];

  return productos.filter((p) => p.nombre?.toLowerCase().includes(normalizado));
}
