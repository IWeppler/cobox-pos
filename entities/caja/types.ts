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

/** Un medio de pago del breakdown gerencial. `tipo` NO es una unión cerrada a
 * propósito: la RPC devuelve los buckets canónicos más cualquier tipo que
 * aparezca en datos viejos (ej. BILLETERA_VIRTUAL en Evens), para que no se
 * evapore plata del total. La UI tiene que tener un fallback de label. */
export interface MedioPagoResumen {
  tipo: string;
  monto: number;
  /** Ventas distintas tocadas por este medio. En pago mixto la misma venta
   * cuenta en cada medio que usó, así que la suma de la columna puede superar
   * la cantidad de ventas del día. */
  cantidad_ventas: number;
  /** Porción de `monto` que es cobranza de deuda vieja, no venta de hoy. */
  monto_cobranzas_cc: number;
}

export interface ResumenGerencialCaja {
  fecha: string;
  generado_en: string;
  ventas: {
    /** Cobrado por ventas del día. Excluye cobranzas de cuenta corriente. */
    total_cobrado: number;
    cantidad_ventas: number;
  };
  cuenta_corriente: {
    /** Fiado otorgado hoy: plata que NO entró. */
    fiado_otorgado: number;
    cantidad_ventas_con_fiado: number;
    /** Deuda vieja cobrada hoy: plata que SÍ entró, ya contada dentro de
     * `breakdown_medios`. Sumarla a `ventas.total_cobrado` la duplica. */
    cobranzas_monto: number;
    cobranzas_cantidad: number;
  };
  breakdown_medios: MedioPagoResumen[];
  caja: {
    fondo_inicial: number;
    ingresos_efectivo: number;
    egresos_efectivo: number;
    esperado: number;
    turnos_totales: number;
    turnos_abiertos: number;
    cierre_completo: boolean;
    /** null mientras quede algún turno abierto — ahí la UI muestra estado
     * parcial, nunca una diferencia. */
    real_declarado: number | null;
    diferencia: number | null;
  };
}

/** Una fila del expandible de un medio de pago. Es un COBRO, no una venta: una
 * venta con pago mixto aparece una vez por cada medio que usó. */
export interface DetalleMedioPago {
  pago_id: string;
  venta_id: string | null;
  metodo_tipo: string;
  metodo_nombre: string;
  monto: number;
  /** Cobro de deuda vieja, no venta del día. */
  es_cobranza_cc: boolean;
  fecha: string;
  vendedor: string | null;
  cliente: string | null;
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
