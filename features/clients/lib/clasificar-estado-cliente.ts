export type EstadoCliente = "al_dia" | "con_deuda" | "vencido";

/**
 * Única fuente de verdad para el estado de deuda de un cliente (tabla,
 * filtro y detalle deben coincidir siempre). Una deuda solo se considera
 * vencida si tiene fecha_vencimiento_deuda Y esa fecha ya pasó — sin
 * fecha, o con fecha futura, es "con deuda" a secas.
 */
export function clasificarEstadoCliente(
  saldoPendiente: number,
  diasVencido: number | null,
): EstadoCliente {
  if (saldoPendiente <= 0) return "al_dia";
  if (diasVencido !== null && diasVencido > 0) return "vencido";
  return "con_deuda";
}
