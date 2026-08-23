export type ModalidadPago = "mensual" | "semestral";

export const MESES_POR_MODALIDAD: Record<ModalidadPago, number> = {
  mensual: 1,
  semestral: 6,
};

/**
 * Qué período cubre un pago.
 *
 * LA DECISIÓN QUE IMPORTA: desde dónde se cuenta.
 *
 * Se cuenta desde el vencimiento vigente si todavía no pasó, y desde hoy si ya
 * venció. Eso es lo que hace que pagar antes no cueste días: quien paga el 20
 * con vencimiento el 30 queda cubierto hasta el 30 del mes siguiente, no hasta
 * el 20. Si se contara siempre desde hoy, adelantarse al pago sería regalarle
 * a Comerz los días que faltaban — y el cliente lo nota una vez.
 *
 * Al revés, quien paga tarde arranca HOY y no en su vencimiento viejo: los días
 * que estuvo sin pagar no se cubren retroactivamente.
 *
 * Sumar meses en JS tiene una trampa: `setMonth(+1)` sobre un 31 de enero da 3
 * de marzo, porque febrero no tiene 31. Acá se topea al último día del mes
 * destino, así que el 31/1 mensual vence el 28/2 y no se corre solo.
 */
export function sumarMeses(fechaISO: string, meses: number): string {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);

  const anioDestino = anio + Math.floor((mes - 1 + meses) / 12);
  const mesDestino = ((mes - 1 + meses) % 12) + 1;

  // Día 0 del mes siguiente = último día del mes destino.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();
  const diaDestino = Math.min(dia, ultimoDia);

  return `${anioDestino}-${String(mesDestino).padStart(2, "0")}-${String(
    diaDestino,
  ).padStart(2, "0")}`;
}

export interface PeriodoPago {
  desde: string;
  hasta: string;
}

export function calcularPeriodoPago({
  hoy,
  vencimientoActual,
  modalidad,
}: {
  hoy: string;
  vencimientoActual: string | null;
  modalidad: ModalidadPago;
}): PeriodoPago {
  // El que sea mayor: si la suscripción sigue viva, el período nuevo empieza
  // donde termina la anterior.
  const desde =
    vencimientoActual && vencimientoActual > hoy ? vencimientoActual : hoy;

  return { desde, hasta: sumarMeses(desde, MESES_POR_MODALIDAD[modalidad]) };
}
