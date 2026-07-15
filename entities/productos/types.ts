export interface ProductoStock {
  id: string;
  producto_id?: string;
  variante: string;
  cantidad: number;
}

export interface ProductoVariante {
  id: string;
  producto_id: string;
  sku: string | null;
  nombre_display: string;
  precio: number | null;
  costo: number | null;
  stock: number;
  /** stock físico neto de reservas ACTIVAS. Solo lo calculan las actions que ya consultan `reservas`; si no viene, tratar como igual a `stock`. */
  stock_disponible?: number;
  stock_minimo: number;
  activa: boolean;
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
  creado_en: string;
  publicado: boolean;
  slug: string | null;
  descripcion?: string | null;
  atributos_globales?: Record<string, string>;
  stock?: ProductoStock[];
  producto_variantes?: ProductoVariante[];
}
