import type { Opcion, VarianteInput } from "@/features/stock/types";

export type LineaCargaExistente = {
  kind: "EXISTENTE";
  clienteLineaId: string;
  varianteId: string;
  productoId: string;
  nombreDisplay: string;
  nombreProducto: string;
  sku: string | null;
  cantidad: number;
  precioCosto: number;
  precioVenta: number;
};

type LineaCargaNuevaBase = {
  kind: "NUEVA";
  clienteLineaId: string;
  queryOriginal: string;
  nombre: string;
  codigo: string | null;
  marca: string | null;
  /** Modelo oficial (T4/T5). Se precarga del Catálogo Maestro cuando el EAN
   * matchea, y queda editable. */
  modelo: string | null;
  categoriaId: string | null;
  precioCompra: number;
  precioVenta: number;
  /** Referencia al producto del maestro del que se precargó, si hubo match.
   * Los datos ya están COPIADOS en los campos de arriba: esto es solo
   * trazabilidad, nada de la venta depende de poder resolverlo después. */
  idMaster: string | null;
};

/** Producto nuevo simple: una sola línea, cantidad editable inline en la
 * lista, igual que hoy. */
export type LineaCargaNuevaSimple = LineaCargaNuevaBase & {
  tieneVariantes: false;
  cantidad: number;
};

/** Producto nuevo con variantes (talle/color/etc): el stock y precio
 * viven por combinación, igual que en el alta completa de Stock — no hay
 * una "cantidad" única a nivel línea. Se edita reabriendo el modal. */
export type LineaCargaNuevaConVariantes = LineaCargaNuevaBase & {
  tieneVariantes: true;
  opciones: Opcion[];
  variantes: VarianteInput[];
};

export type LineaCargaNueva =
  | LineaCargaNuevaSimple
  | LineaCargaNuevaConVariantes;

export type LineaCarga = LineaCargaExistente | LineaCargaNueva;

export type ResultadoLineaCarga = {
  clienteLineaId: string;
  ok: boolean;
  error?: string;
};

export type ConfirmarCargaResponse = {
  resultados: ResultadoLineaCarga[];
  totalOk: number;
  totalError: number;
};
