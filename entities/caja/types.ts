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
  producto?: {
    nombre?: string | null;
  } | null;
  perfiles?: {
    nombre?: string | null;
  } | null;
}

export interface EgresoCaja {
  id: string;
  monto: number | string;
  concepto: string;
  fecha: string;
  perfiles?: {
    nombre?: string | null;
  } | null;
}
