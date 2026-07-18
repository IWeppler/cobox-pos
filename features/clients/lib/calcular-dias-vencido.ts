/**
 * Días transcurridos desde fecha_vencimiento_deuda hasta hoy (positivo =
 * vencida). Aritmética en UTC de punta a punta: fecha_vencimiento_deuda es
 * una fecha calendario pura (columna `date`, sin hora), no un instante —
 * si se mezclara con Date.now() en hora local se corre un día según el
 * huso horario del navegador.
 */
export function calcularDiasVencido(
  fechaVencimientoDeuda: string | null | undefined,
): number | null {
  if (!fechaVencimientoDeuda) return null;

  const [anio, mes, dia] = fechaVencimientoDeuda.split("-").map(Number);
  const vencUTC = Date.UTC(anio, mes - 1, dia);
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return Math.floor((hoyUTC - vencUTC) / 86400000);
}
