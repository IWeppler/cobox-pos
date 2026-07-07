export type Opcion = {
  id: string;
  nombre: string;
  valores: string[];
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
