import type { Producto } from "@/entities/productos/types";
import type { ProductoCargado } from "@/features/carga-rapida/types";

/**
 * Adapta lo que reporta la Carga rápida a un `Producto` completo, para que lo
 * recién cargado entre por EL MISMO camino que un producto tocado en la
 * grilla (resolución de variantes, selector de variante, alta al carrito) sin
 * esperar a que React Query recargue el catálogo.
 *
 * Lo que no viaja en el reporte va en su valor vacío honesto: sin imágenes,
 * sin slug, sin costo y sin stock legacy. Nada de eso lo lee este camino —
 * el carrito usa precio, y el costo real lo resuelve `create-sale` contra la
 * base al confirmar la venta.
 */
export function productoCargadoAProducto(cargado: ProductoCargado): Producto {
  return {
    id: cargado.id,
    nombre: cargado.nombre,
    tipo: cargado.tipo,
    precio: cargado.precio,
    precio_costo: 0,
    imagen_url: null,
    thumbnail_url: null,
    grid_url: null,
    creado_en: new Date().toISOString(),
    publicado: true,
    slug: null,
    stock: [],
    producto_variantes: cargado.variantes.map((v) => ({
      id: v.id,
      nombre_display: v.nombre_display,
      precio: v.precio,
      costo: null,
      stock: v.stock,
    })),
  };
}

/** Las tres columnas de imagen guardan un JSON array serializado, pero los
 * productos viejos guardaron un string suelto. Este parseo estaba copiado en
 * pos-terminal.tsx (dos veces) y en quick-add-modal.tsx. */
function parsearUrls(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor as string[];
  if (typeof valor !== "string" || valor === "") return [];
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [valor];
  } catch {
    return [valor];
  }
}

/**
 * Imagen para la card / la línea del carrito. El orden es por tamaño servido:
 * grid (320px) primero, después thumbnail (150px) y por último la original.
 */
export function resolverImagenPrincipal(
  producto: Pick<Producto, "imagen_url" | "thumbnail_url" | "grid_url">,
): string | null {
  return (
    parsearUrls(producto.grid_url)[0] ??
    parsearUrls(producto.thumbnail_url)[0] ??
    parsearUrls(producto.imagen_url)[0] ??
    null
  );
}

export interface VarianteVendible {
  variante: string;
  cantidad: number;
  precio: number | null;
  /** producto_variantes.id real; undefined en el fallback legacy (productos_stock). */
  varianteId: string | undefined;
}

/**
 * Variantes que se pueden vender ahora mismo.
 *
 * Solo se recurre al stock legacy (productos_stock) si el producto nunca se
 * migró a producto_variantes — si no, se duplica el conteo porque ambas
 * fuentes describen el mismo stock. En ese fallback `varianteId` queda
 * undefined a propósito: nunca es el id de la fila de stock legacy.
 */
export function resolverVariantesVendibles(
  producto: Producto,
  permitirVentaSinStock: boolean,
): VarianteVendible[] {
  const todas: VarianteVendible[] = [];

  producto.producto_variantes?.forEach((v) =>
    todas.push({
      variante: v.nombre_display,
      cantidad: v.stock_disponible ?? v.stock,
      precio: v.precio,
      varianteId: v.id,
    }),
  );

  if ((producto.producto_variantes?.length ?? 0) === 0) {
    producto.stock?.forEach((s) =>
      todas.push({
        variante: s.variante,
        cantidad: s.cantidad,
        precio: null,
        varianteId: undefined,
      }),
    );
  }

  return permitirVentaSinStock ? todas : todas.filter((v) => v.cantidad > 0);
}
