export interface OrdenCompra {
  id: string;
  proveedor: string;
  fecha_remito: string;
  total_presupuestado: number;
  estado: "PENDIENTE" | "APROBADA";
  creado_en: string;
}

export interface SugerenciaSimilitud {
  raw_nombre: string;
  producto_id: string;
  producto_nombre: string;
  categoria_id: string | null;
  marca: string | null;
  score: number;
}

export interface ItemResuelto {
  id?: string;
  orden_id?: string;
  producto_id: string | null;
  raw_nombre: string;
  raw_variante: string;
  raw_categoria?: string | null;
  raw_categoria_id?: string | null;
  raw_sku?: string | null;
  raw_marca?: string | null;
  raw_genero?: string | null;
  variante_match: string;
  cantidad: number;
  precio_costo: number;
  precio_venta_actualizado?: number;
  estado_match:
    | "PERFECTO"
    | "MODIFICADO"
    | "DESCONOCIDO"
    | "NUEVO_ALIAS"
    | "RESUELTO";
}
