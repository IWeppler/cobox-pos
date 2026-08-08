import { slugify } from "@/shared/utils/slugify";
import {
  canonicalizarValores,
  type AtributoCache,
} from "@/features/stock/lib/normalize-atributo";
import { claveAtributos, claveProducto, type ItemPlan } from "./import-productos-plan";

/**
 * Una fila del archivo, ya resuelta y lista para que la escriba la RPC
 * `importar_productos_planilla`. Nombres en snake_case porque viajan tal
 * cual dentro del jsonb que lee plpgsql.
 */
export interface ItemPayloadImport {
  fila: number;
  producto: string;
  /** Agrupa filas del mismo producto DENTRO del archivo (la RPC no slugifica). */
  clave_producto: string;
  /** Idem para la combinación de atributos. */
  clave_variante: string;
  producto_id: string | null;
  variante_id: string | null;
  nombre_display: string;
  atributos: Record<string, string>;
  relaciones: { atributo_id: string; atributo_valor_id: string }[];
  imei: string | null;
  stock: number;
  precio_costo: number | null;
  precio_venta: number | null;
  codigo_barras: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  /** Solo se usa si la fila termina creando el producto. */
  slug: string;
}

/**
 * Traduce el plan a lo que espera la RPC. Todo lo que necesita criterio de
 * Node (canonicalización de atributos contra el diccionario, nombre_display,
 * slug) se resuelve acá; la RPC solo hace la coreografía de escritura.
 *
 * Puro y con el sufijo del slug inyectable para poder testearlo — mismo
 * criterio que el resto de `features/stock/lib`.
 */
export function construirPayloadImport(
  items: ItemPlan[],
  atributoCache: AtributoCache,
  sufijoSlug: () => string = () => Math.random().toString(36).substring(2, 6),
): ItemPayloadImport[] {
  return items.map((item) => {
    const valoresCanonicos = canonicalizarValores(item.atributos, atributoCache);
    const tipo = item.categoriaNombre || "General";

    const relaciones = Object.entries(item.atributos).flatMap(
      ([nombreOriginal, valorOriginal]) => {
        const entry = atributoCache[nombreOriginal];
        const valorEntry = entry?.valores[valorOriginal];
        if (!entry || !valorEntry) return [];
        return [
          {
            atributo_id: entry.atributoId,
            atributo_valor_id: valorEntry.valorId,
          },
        ];
      },
    );

    return {
      fila: item.fila,
      producto: item.producto,
      clave_producto: claveProducto(item.producto),
      clave_variante: claveAtributos(item.atributos),
      producto_id: item.productoId,
      variante_id: item.varianteId,
      // Mismo criterio que la carga manual: sin atributos, la variante única
      // se llama "Único".
      nombre_display: Object.values(valoresCanonicos).join(" / ") || "Único",
      atributos: valoresCanonicos,
      relaciones,
      imei: item.imei,
      stock: item.stock,
      precio_costo: item.precioCosto,
      precio_venta: item.precioVenta,
      codigo_barras: item.codigoBarras,
      categoria_id: item.categoriaId,
      categoria_nombre: item.categoriaNombre,
      slug: `${slugify(`${item.producto}-${tipo}`)}-${sufijoSlug()}`,
    };
  });
}
