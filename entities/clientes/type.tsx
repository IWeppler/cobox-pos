export type CondicionIVA = 
  | "Consumidor Final"
  | "Responsable Inscripto"
  | "Monotributo"
  | "Exento"
  | "Sujeto No Categorizado";

export interface Cliente {
  id: string;

  // --- DATOS COMERCIALES ---
  nombre: string; // Nombre de Pila
  telefono: string;
  email?: string | null;
  dni?: string | null; // Útil para Facturas B grandes a Consumidor Final
  /** Dirección de contacto/entrega. Existe para cualquier cliente, tenga o no
   * datos fiscales — es distinta del domicilio fiscal (`direccion`). */
  direccion_comercial?: string | null;

  // --- DATOS FISCALES ---
  razon_social?: string | null;
  cuit?: string | null;
  condicion_iva?: CondicionIVA | null;
  /** Domicilio fiscal: el que va impreso en la factura. */
  direccion?: string | null;
  provincia?: string | null;
  localidad?: string | null;
  codigo_postal?: string | null;

// --- DATOS OPERATIVOS ---
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
  fecha_origen?: string | null;
  anulado?: boolean;
  anulado_en?: string | null;
  anulado_por?: string | null;
}
