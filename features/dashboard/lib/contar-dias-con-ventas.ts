import type { Venta } from "@/entities/ventas/types";
import type { RangoFechas } from "@/shared/lib/periodo-ranges";

/**
 * Días distintos con al menos una venta dentro del rango. Es la aproximación
 * a "cuántos días estuvo abierto el local", que es lo que hace comparable un
 * total contra otro: sumar dos días abiertos contra uno no compara nada.
 *
 * POR QUÉ NO SALE DE `turnos_caja`, que sería el dato correcto. La idea es la
 * buena —apertura y cierre de caja dicen si el local abrió, y un martes de
 * lluvia con cero ventas es información real que este conteo pierde— pero la
 * tabla no lo sostiene. Medido sobre 60 días de los 4 negocios:
 *
 * - Los turnos NO son diarios: 15 de 22 turnos de Estilo Bonito abarcan más
 *   de un día (promedio 24,5 h, máximo 235,7 h ≈ 10 días), y los 2 de
 *   ClickTostado promedian 167 h. Un turno abierto cinco días no significa
 *   que el local abrió cinco días, así que contar aperturas por fecha no
 *   cuenta días abiertos.
 * - Y tampoco cubren todo: Estilo Bonito vendió en 26 días y solo tiene
 *   turnos abiertos en 22, con 8 días de ventas sin ningún turno.
 *
 * O sea que hoy `turnos_caja` daría un conteo peor que este. Cuando el cierre
 * de turno sea diario y obligatorio, la fuente correcta pasa a ser la unión de
 * las dos (día con turno O con venta), que es la única que también captura el
 * día abierto sin vender. Anotado acá para que el día que se cambie se cambie
 * por el motivo correcto.
 */
export function contarDiasConVentas(
  ventasOperativas: Venta[],
  rango: RangoFechas,
): number {
  const inicioMs = rango.inicio.getTime();
  const finMs = rango.fin.getTime();
  const dias = new Set<string>();

  for (const v of ventasOperativas) {
    const f = new Date(v.fecha_venta);
    const ms = f.getTime();
    if (ms < inicioMs || ms > finMs) continue;
    // Por componentes locales, no ISO: el día es el del local, no el UTC.
    dias.add(`${f.getFullYear()}-${f.getMonth()}-${f.getDate()}`);
  }

  return dias.size;
}
