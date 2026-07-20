export interface Cliente {
  id: string;
  nombre: string;
  dni?: string | null;
  telefono: string;
  email?: string | null;
  notas?: string | null;
  activo: boolean;
  saldo_pendiente: number;
  reglas_credito: Record<string, any>;
  exceptuado_entrega_minima: boolean;
  fecha_vencimiento_deuda?: string | null;
  creado_en: string;
}

export type TipoMovimientoCC = "DEBITO" | "CREDITO";

export interface CuentaCorrienteMovimiento {
  id: string;
  cliente_id: string;
  venta_id?: string | null;
  pago_id?: string | null;
  tipo: TipoMovimientoCC;
  monto: number;
  monto_recargo: number;
  descripcion?: string | null;
  creado_por?: string | null;
  creado_en: string;
}
