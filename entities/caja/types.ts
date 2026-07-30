export interface Movimiento {
  id: string;
  tipo: "INGRESO" | "EGRESO";
  descripcion: string;
  concepto: string;
  metodo: string;
  monto: number;
  fecha: string;
  usuario: string;
  creado_en: string;
}

export interface CajaActionState {
  error: string | null;
  success: boolean;
}

export interface TurnoCajaHistorial {
  id: string;
  vendedor_id?: string | null;
  modo?: string | null;
  monto_inicial: number | string;
  monto_final: number | string | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  efectivo_esperado?: number | string | null;
  estado: string;
  perfiles?: {
    nombre?: string | null;
  } | null;
}

export interface VentaCaja {
  id: string;
  total: number | string;
  metodo_pago?: string | null;
  fecha_venta: string;
  cliente_id?: string | null;
  monto_cobrado?: number | null;
  monto_pendiente?: number | null;
  estado_pago?: string | null;
  clientes?:
    | {
        nombre?: string | null;
      }
    | {
        nombre?: string | null;
      }[]
    | null;
  perfiles?: {
    nombre?: string | null;
  } | { nombre?: string | null }[] | null;
  ventas_items?: {
    producto?:
      | {
          nombre?: string | null;
        }
      | {
          nombre?: string | null;
        }[]
      | null;
  }[];
  venta_pagos?: {
    id?: string;
    metodo_nombre: string;
    metodo_tipo: string;
    /** Lo que el cobro imputa al ticket/deuda. monto_bruto = base + recargo. */
    monto_base?: number;
    recargo_porcentaje?: number;
    recargo_monto?: number;
    monto_bruto: number;
    comision_monto: number;
    monto_neto: number;
    acreditacion_dias?: number;
    tipo_movimiento?: string;
  }[];
}

export interface EgresoCaja {
  id: string;
  monto: number | string;
  concepto: string;
  fecha: string;
  creado_por?: string | null;
  turno_caja_id?: string | null;
  perfiles?: {
    nombre?: string | null;
  } | null;
}
