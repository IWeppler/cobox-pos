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

/**
 * Estados de una unidad serializada. El CHECK de la tabla es fail-closed:
 * agregar un estado acá sin migración no lo hace válido en la base.
 */
export type EstadoUnidadSerie = "disponible" | "vendido";

/**
 * Una unidad física con IMEI / número de serie (rubro electro). A diferencia
 * de `ProductoVariante.stock`, que es un contador de unidades intercambiables,
 * acá cada fila es UN aparato: es lo que permite garantía y trazabilidad por
 * equipo.
 *
 * Todavía nada del flujo de ventas lee ni escribe esta tabla: la fuente de
 * verdad del stock sigue siendo `producto_variantes.stock`.
 */
export interface UnidadSerie {
  id: string;
  /** Reservado para multi-tenant (ROADMAP TIER 2). Siempre null en el modelo por-proyecto actual. */
  negocio_id?: string | null;
  producto_variante_id: string;
  imei: string;
  estado: EstadoUnidadSerie;
  fecha_ingreso: string;
  /** La base garantiza el par: no-null si y solo si estado === 'vendido'. */
  fecha_venta: string | null;
  /** Sin FK en la base — puede apuntar a una venta que ya no existe, o ser null en una venta cargada a mano. */
  venta_id: string | null;
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
  grid_url: string | null;
  creado_en: string;
  publicado: boolean;
  slug: string | null;
  descripcion?: string | null;
  marca?: string | null;
  /** Modelo oficial del fabricante (T4, rubro electro). Texto libre, mismo
   * patrón que `marca`. Nullable: en indumentaria no se usa. */
  modelo?: string | null;
  /** Segmento en indumentaria (Mujer, Hombre, Unisex). Texto libre. */
  genero?: string | null;
  /** Tratamiento frente al IVA. Un solo campo dice alícuota Y condición —
   * ver shared/lib/fiscal-producto.ts. Default en la base: GRAVADO_21. */
  tratamiento_iva?: string | null;
  /** Unidad semántica de venta. El código fiscal de ARCA se traduce desde
   * esto cuando se conecte la facturación. Default en la base: UNIDAD. */
  unidad_medida?: string | null;
  atributos_globales?: Record<string, string>;
  stock?: ProductoStock[];
  producto_variantes?: ProductoVariante[];
}

/**
 * Forma liviana de un producto para /stock: lo que hace falta para buscar,
 * filtrar por categoría/variante, ordenar, paginar y RENDERIZAR la fila
 * (miniatura, link de compartir, estado publicado) 100% client-side sobre
 * el catálogo COMPLETO, sin re-fetch por tipeo/orden/página. Trae los tres
 * tiers de imagen (`imagen_url`/`thumbnail_url`/`grid_url`) porque cada
 * superficie necesita el suyo: la tabla usa el thumbnail (150px, fila
 * chica), la grilla usa `grid_url` (320px, celda de ~230-400px en
 * tablet — ver diagnóstico de borrosidad). Sigue sin traer `descripcion`,
 * `creado_en` ni `producto_variante_valores` completos de variante — esos
 * solo hacen falta para el formulario de edición de UN producto, que los
 * trae con su propio fetch on-demand al abrir el sheet (ver
 * getStockDetalleProductoAction).
 *
 * `sku` de variante SÍ se trae desde T4: en rubro electro la fila de
 * inventario muestra el EAN, que se guarda en ese mismo campo. Es un texto
 * corto por variante y evita un segundo fetch por fila; en indumentaria
 * queda sin leer.
 */
export type ProductoIndice = Pick<
  Producto,
  | "id"
  | "nombre"
  | "tipo"
  | "precio"
  | "precio_costo"
  | "categoria_id"
  | "marca"
  | "modelo"
  | "imagen_url"
  | "thumbnail_url"
  | "grid_url"
  | "slug"
  | "publicado"
> & {
  categoria?: CategoriaRelacion | null;
  producto_variantes?: Pick<
    ProductoVariante,
    | "id"
    | "sku"
    | "nombre_display"
    | "precio"
    | "costo"
    | "stock"
    | "atributos"
    | "producto_variante_valores"
  >[];
  stock?: Pick<ProductoStock, "cantidad">[];
};
