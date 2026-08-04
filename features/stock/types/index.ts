export type Opcion = {
  id: string;
  nombre: string;
  valores: string[];
  // true cuando esta opción fue auto-agregada porque categoria_atributos la
  // marca como requerida para la categoría elegida — no se puede eliminar
  // ni renombrar desde la UI mientras la categoría siga exigiéndola.
  bloqueado?: boolean;
};

export type VariantDataState = {
  stock: string;
  precio: string;
  precio_costo: string;
  sku: string;
};

export type VarianteInput = {
  key: string;
  valores: Record<string, string>;
} & VariantDataState;

export type BaseVariant = {
  key: string;
  valores: Record<string, string>;
};

export type CategoriaOption = {
  id: string;
  nombre: string;
};

/** Lo mínimo del producto recién creado para poder usarlo sin re-fetch — hoy
 * lo consume la venta sin cargar del POS, que lo mete al carrito en el acto.
 * Solo viene en el alta exitosa; el resto de los llamadores lo ignora. */
export type ProductoCreado = {
  id: string;
  nombre: string;
  tipo: string;
  precio: number;
  variantes: {
    id: string;
    nombre_display: string;
    /** null = hereda el precio del producto (mismo criterio que la base). */
    precio: number | null;
    stock: number;
  }[];
};

export type ProductActionState = {
  error: string | null;
  success: boolean;
  producto?: ProductoCreado;
};
