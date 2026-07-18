/**
 * fecha_venta + plazoDias, en UTC de punta a punta (misma razón que
 * calcularDiasVencido: fecha_vencimiento_deuda es una columna `date` sin
 * hora, mezclarla con aritmética en hora local corre el día según el huso
 * horario del servidor). Devuelve "YYYY-MM-DD" listo para esa columna.
 */
export function calcularFechaVencimiento(
  fechaVenta: string | Date,
  plazoDias: number,
): string {
  const fecha = typeof fechaVenta === "string" ? new Date(fechaVenta) : fechaVenta;
  const vencimiento = new Date(
    Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate() + plazoDias,
    ),
  );

  const anio = vencimiento.getUTCFullYear();
  const mes = String(vencimiento.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(vencimiento.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}
