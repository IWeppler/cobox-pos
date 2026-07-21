export interface ProductoStock {
  id: string;
  producto_id?: string;
  variante: string;
  cantidad: number;
}

export interface ProductoVariante {
  id: string;
  /** No lo trae get-product.ts (ni index ni detalle) — nada lo lee, siempre se conoce por el producto padre. */
  producto_id?: string;
  /** No lo trae la query "índice" de stock (features/stock/actions/get-product.ts) — solo el detalle de página. */
  sku?: string | null;
  nombre_display: string;
  precio: number | null;
  costo: number | null;
  stock: number;
  /** stock físico neto de reservas ACTIVAS. Solo lo calculan las actions que ya consultan `reservas`; si no viene, tratar como igual a `stock`. */
  stock_disponible?: number;
  /** No lo trae get-product.ts — sin uso en ningún lado de la app hoy. */
  stock_minimo?: number;
  /** No lo trae get-product.ts — sin uso en ningún lado de la app hoy (ni siquiera se filtra por esto en esa query). */
  activa?: boolean;
  atributos?: Record<string, string>;
  producto_variante_valores?: {
    atributo?: {
      nombre?: string | null;
    } | null;
    atributo_valor?: {
      valor?: string | null;
    } | null;
  }[];
}

export interface CategoriaRelacion {
  id: string;
  nombre: string;
  slug: string;
}

export interface Producto {
  id: string;
  nombre: string;
  tipo: string;
  categoria_id?: string | null;
  categoria?: CategoriaRelacion | null;
  precio: number;
  precio_costo: number;
  imagen_url: string | null;
  thumbnail_url: string | null;
  creado_en: string;
  publicado: boolean;
  slug: string | null;
  descripcion?: string | null;
  atributos_globales?: Record<string, string>;
  stock?: ProductoStock[];
  producto_variantes?: ProductoVariante[];
}

/**
 * Forma liviana de un producto para /stock: solo lo que hace falta para
 * buscar, filtrar por categoría/variante, ordenar y calcular agregados
 * (conteos por categoría, opciones del filtro de variantes) sobre el
 * catálogo COMPLETO — sin las columnas pesadas (imagen_url, thumbnail_url,
 * descripcion) que solo hacen falta para la página de 10 que se ve.
 * Ver getStockIndexAction / getStockPageDetailAction en
 * features/stock/actions/get-product.ts.
 */
export type ProductoIndice = Pick<
  Producto,
  "id" | "nombre" | "tipo" | "precio" | "precio_costo" | "categoria_id"
> & {
  categoria: CategoriaRelacion | null;
  producto_variantes: Pick<
    ProductoVariante,
    | "id"
    | "nombre_display"
    | "precio"
    | "costo"
    | "stock"
    | "atributos"
    | "producto_variante_valores"
  >[];
  stock: Pick<ProductoStock, "cantidad">[];
};
