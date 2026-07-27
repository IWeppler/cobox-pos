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

export type ProductActionState = {
  error: string | null;
  success: boolean;
};
