import { formatearNumeroComprobante } from "@/shared/lib/facturacion";

/**
 * Arma las filas de cada exportación a partir de los datos crudos.
 *
 * Puro y sin IO: la action consulta, esto ordena. Así el formato de cada
 * planilla —que es lo que el contador ve y lo único que le importa— se prueba
 * sin base y sin Excel de por medio.
 *
 * Criterios que valen para TODAS las planillas:
 *
 *  - Los importes van como NÚMERO, no como texto con "$". Un contador filtra,
 *    suma y pivotea: un importe como texto convierte la planilla en un dibujo.
 *  - Las fechas van como texto ISO (YYYY-MM-DD HH:mm). Excel interpreta los
 *    formatos ambiguos según la configuración regional de QUIEN abre el
 *    archivo, y 03/04 puede ser marzo o abril según la máquina del contador.
 *  - Las columnas se declaran explícitas y en orden. Volcar el objeto crudo
 *    haría que agregar una columna en la base cambie la planilla sin que nadie
 *    lo decida.
 *  - Una venta ANULADA aparece, marcada como anulada. Sacarla haría que la
 *    numeración tenga huecos sin explicación.
 */

export type Fila = Record<string, string | number | null>;

/** Fecha y hora local en formato no ambiguo. */
export function formatearFechaHoraExport(valor: unknown): string {
  if (!valor) return "";
  const fecha = new Date(String(valor));
  if (Number.isNaN(fecha.getTime())) return "";

  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())} ${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

export function formatearFechaExport(valor: unknown): string {
  return formatearFechaHoraExport(valor).slice(0, 10);
}

/** Number() tolerante: null, "" y basura dan 0, no NaN. Un NaN en una celda
 * rompe cualquier suma de la planilla entera. */
export function num(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------- Ventas

export interface VentaExport {
  id: string;
  fecha_venta: string;
  estado_operacion?: string | null;
  estado_pago?: string | null;
  metodo_pago?: string | null;
  total?: number | null;
  recargo_metodo_total?: number | null;
  precio_costo?: number | null;
  comision_total?: number | null;
  total_neto?: number | null;
  monto_cobrado?: number | null;
  monto_pendiente?: number | null;
  cantidad?: number | null;
  clientes?: { nombre?: string | null } | null;
  perfiles?: { nombre?: string | null } | null;
  comprobantes?: { tipo: string; punto_venta: number; numero: number }[] | null;
}

export function filasVentas(ventas: readonly VentaExport[]): Fila[] {
  return ventas.map((v) => {
    const comprobante = v.comprobantes?.[0];
    const total = num(v.total);
    const recargo = num(v.recargo_metodo_total);

    return {
      Fecha: formatearFechaHoraExport(v.fecha_venta),
      Comprobante: comprobante
        ? (formatearNumeroComprobante(
            comprobante.punto_venta,
            comprobante.numero,
          ) ?? "")
        : "",
      "Tipo comprobante": comprobante?.tipo ?? "",
      Estado: v.estado_operacion ?? "",
      Cliente: v.clientes?.nombre ?? "Consumidor final",
      Vendedor: v.perfiles?.nombre ?? "",
      "Medio de pago": v.metodo_pago ?? "",
      Unidades: num(v.cantidad),
      // El recargo por método no es venta de mercadería: se muestra aparte y
      // se resta, mismo criterio que los reportes.
      "Total cobrado": total,
      "Recargo por medio de pago": recargo,
      "Venta de mercadería": total - recargo,
      "Costo de la mercadería": num(v.precio_costo),
      "Comisión del procesador": num(v.comision_total),
      "Neto acreditado": num(v.total_neto),
      Cobrado: num(v.monto_cobrado),
      Pendiente: num(v.monto_pendiente),
      "Estado de pago": v.estado_pago ?? "",
      "ID interno": v.id,
    };
  });
}

// --------------------------------------------------------------- Comprobantes

export interface ComprobanteExport {
  tipo: string;
  punto_venta: number;
  numero: number;
  emitido_en: string;
  total?: number | null;
  neto?: number | null;
  iva_monto?: number | null;
  cae?: string | null;
  cae_vencimiento?: string | null;
  receptor_razon_social?: string | null;
  receptor_cuit?: string | null;
  receptor_condicion_iva?: string | null;
  venta_id: string;
}

export function filasComprobantes(
  comprobantes: readonly ComprobanteExport[],
): Fila[] {
  return comprobantes.map((c) => ({
    Fecha: formatearFechaHoraExport(c.emitido_en),
    Tipo: c.tipo,
    Número: formatearNumeroComprobante(c.punto_venta, c.numero) ?? "",
    "Punto de venta": c.punto_venta,
    Receptor: c.receptor_razon_social ?? "Consumidor final",
    CUIT: c.receptor_cuit ?? "",
    "Condición IVA": c.receptor_condicion_iva ?? "",
    "Neto gravado": num(c.neto),
    IVA: num(c.iva_monto),
    Total: num(c.total),
    CAE: c.cae ?? "",
    "Vencimiento CAE": c.cae_vencimiento
      ? formatearFechaExport(c.cae_vencimiento)
      : "",
    "ID venta": c.venta_id,
  }));
}

// --------------------------------------------------------------------- Compras

export interface CompraExport {
  id: string;
  proveedor?: string | null;
  fecha_remito?: string | null;
  total_presupuestado?: number | null;
  estado?: string | null;
  creado_en: string;
}

export function filasCompras(compras: readonly CompraExport[]): Fila[] {
  return compras.map((c) => ({
    "Fecha del remito": c.fecha_remito ? formatearFechaExport(c.fecha_remito) : "",
    Proveedor: c.proveedor ?? "",
    Estado: c.estado ?? "",
    Total: num(c.total_presupuestado),
    "Cargado el": formatearFechaHoraExport(c.creado_en),
    "ID interno": c.id,
  }));
}

// ------------------------------------------------------------ Movimientos caja

export interface TurnoExport {
  id: string;
  fecha_apertura: string;
  fecha_cierre?: string | null;
  estado?: string | null;
  modo?: string | null;
  monto_inicial?: number | null;
  efectivo_esperado?: number | null;
  monto_declarado?: number | null;
  diferencia?: number | null;
  observacion_cierre?: string | null;
  perfiles?: { nombre?: string | null } | null;
}

export function filasMovimientosCaja(turnos: readonly TurnoExport[]): Fila[] {
  return turnos.map((t) => ({
    Apertura: formatearFechaHoraExport(t.fecha_apertura),
    Cierre: t.fecha_cierre ? formatearFechaHoraExport(t.fecha_cierre) : "",
    Estado: t.estado ?? "",
    Modo: t.modo ?? "",
    Responsable: t.perfiles?.nombre ?? "",
    "Monto inicial": num(t.monto_inicial),
    // En un turno ABIERTO este valor quedó congelado en el monto inicial: no
    // es el efectivo real de ahora. Se exporta igual y el estado lo aclara.
    "Efectivo esperado": num(t.efectivo_esperado),
    "Efectivo declarado": num(t.monto_declarado),
    Diferencia: num(t.diferencia),
    Observaciones: t.observacion_cierre ?? "",
    "ID interno": t.id,
  }));
}

// ------------------------------------------------------- Movimientos generales

export interface PagoExport {
  creado_en: string;
  metodo_nombre?: string | null;
  metodo_tipo?: string | null;
  monto_base?: number | null;
  recargo_monto?: number | null;
  monto_bruto?: number | null;
  comision_monto?: number | null;
  monto_neto?: number | null;
  tipo_movimiento?: string | null;
  estado_pago_operacion?: string | null;
  venta_id?: string | null;
}

export interface EgresoExport {
  fecha: string;
  concepto?: string | null;
  monto?: number | null;
  tipo?: string | null;
}

/**
 * Cobros y egresos en UNA sola planilla, ordenada por fecha.
 *
 * Van juntos y con signo porque es la pregunta que el contador hace: qué entró
 * y qué salió, en orden. Dos hojas separadas obligan a cruzarlas a mano.
 * El egreso va NEGATIVO por el mismo motivo: para que la columna sume el neto
 * del período sin tener que restar nada.
 */
export function filasMovimientosGenerales(
  pagos: readonly PagoExport[],
  egresos: readonly EgresoExport[],
): Fila[] {
  const filasPagos: Fila[] = pagos.map((p) => ({
    Fecha: formatearFechaHoraExport(p.creado_en),
    Movimiento: "INGRESO",
    Concepto:
      p.tipo_movimiento === "PAGO_CUENTA_CORRIENTE"
        ? "Cobro de cuenta corriente"
        : "Cobro de venta",
    "Medio de pago": p.metodo_nombre ?? "",
    Importe: num(p.monto_bruto),
    "Base imputada": num(p.monto_base),
    Recargo: num(p.recargo_monto),
    Comisión: num(p.comision_monto),
    "Neto acreditado": num(p.monto_neto),
    Estado: p.estado_pago_operacion ?? "",
    "ID venta": p.venta_id ?? "",
  }));

  const filasEgresos: Fila[] = egresos.map((e) => ({
    Fecha: formatearFechaHoraExport(e.fecha),
    Movimiento: "EGRESO",
    Concepto: e.concepto ?? "",
    "Medio de pago": "",
    Importe: -Math.abs(num(e.monto)),
    "Base imputada": null,
    Recargo: null,
    Comisión: null,
    "Neto acreditado": null,
    Estado: e.tipo ?? "",
    "ID venta": "",
  }));

  return [...filasPagos, ...filasEgresos].sort((a, b) =>
    String(a.Fecha).localeCompare(String(b.Fecha)),
  );
}
