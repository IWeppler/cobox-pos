export type SupabaseRelation<T> = T | T[] | null;

export const getSupabaseRelation = <T>(
  relation: SupabaseRelation<T> | undefined,
): T | null => {
  if (!relation) return null;
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
};

export interface VentaItem {
  id: string;
  venta_id: string;
  producto_id?: string | null;
  variante: string;
  cantidad: number;
  precio_unitario: number;
  precio_costo?: number;
  descuento_monto?: number;
  precio_final?: number;
  promocion_nombre?: string | null;
  producto?: VentaProducto | null;
}

export interface VentaProducto {
  nombre?: string;
  tipo?: string;
  precio_costo?: number;
}

export interface VentaDescuento {
  monto_descontado: number;
  promocion_nombre: string;
}

export interface VentaPago {
  id?: string;
  venta_id?: string;
  cliente_id?: string | null;
  metodo_pago_id?: string | null;
  metodo_nombre: string;
  metodo_tipo: string;
  /** Lo que el cobro imputa al ticket o a la deuda. */
  monto_base?: number;
  /** % de recargo por método, congelado al momento del cobro. */
  recargo_porcentaje?: number;
  recargo_monto?: number;
  /** Lo que efectivamente entró: monto_base + recargo_monto. */
  monto_bruto: number;
  comision_porcentaje?: number;
  comision_monto: number;
  monto_neto: number;
  acreditacion_dias: number;
  tipo_movimiento?: string; // 'PAGO_VENTA' | 'PAGO_CUENTA_CORRIENTE'
  estado_pago_operacion?: string;
  creado_en?: string;
  clientes?: SupabaseRelation<{ nombre: string }>;
}

export interface CreateSalePaymentInput {
  metodoPagoId: string;
  montoAsignado: number;
}

export type EstadoPagoVenta = "PAGADA" | "PARCIAL" | "PENDIENTE" | "ANULADA";
export type EstadoOperacionVenta = "CONFIRMADA" | "ANULADA";

export interface Venta {
  id: string;
  cliente_id?: string | null;
  total: number;
  precio_costo: number;
  cantidad: number;
  fecha_venta: string;
  metodo_pago?: string | null;
  estado_operacion?: EstadoOperacionVenta | null;

  clientes?: SupabaseRelation<{ nombre?: string | null }>;
  monto_cobrado?: number | null;
  monto_pendiente?: number | null;
  estado_pago?: EstadoPagoVenta | null;

  perfiles?: {
    nombre: string;
  } | null;
  ventas_items?: VentaItem[];
  ventas_descuentos?: VentaDescuento[];
  venta_pagos?: VentaPago[];

  total_bruto?: number;
  comision_total?: number;
  total_neto?: number;
  /** Recargo por método ya incluido en `total`. Los reportes lo restan para
   * no contarlo como venta de mercadería. */
  recargo_metodo_total?: number;
  es_pago_mixto?: boolean;
}

export interface TicketItemData {
  nombre: string;
  variante: string;
  cantidad: number;
  precio?: number;
  precioUnitario?: number;
}

export interface TicketData {
  items: TicketItemData[];
  total: number;
  metodoPago: string;
  nroRecibo: string;
  fecha?: string;
  vendedor?: string;
  descuentoMonto?: number;
  promocionNombre?: string;
  /** Recargo por método de pago cobrado en este ticket. Ya está sumado en
   * `total`; se manda aparte para poder mostrarlo como renglón propio. */
  recargoMetodoMonto?: number;
  /** Ej. "Recargo Tarjeta (15%)". */
  recargoMetodoEtiqueta?: string;
  comisionMonto?: number;
  montoNeto?: number;
  acreditacionDias?: number;
  // Desglose para pagos mixtos
  pagosDesglosados?: {
    nombre: string;
    monto: number;
    tipo?: string;
    comisionMonto?: number;
    montoNeto?: number;
    acreditacionDias?: number;
    tipoMovimiento?: string;
  }[];
  // Datos del Cliente (si fió)
  clienteNombre?: string;
  estadoPago?: string;
  montoCobrado?: number;
  montoPendiente?: number;
  esFiadoDirecto?: boolean;
}
