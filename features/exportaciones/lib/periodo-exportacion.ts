import { type RangoFechas } from "@/shared/lib/periodo-ranges";

/**
 * Períodos de una exportación contable.
 *
 * NO son los del panel ni los de Reportes, y es a propósito: un contador
 * trabaja por cierre mensual. "Últimos 7 días" o "histórico" no son cortes que
 * le sirvan a nadie para presentar, y ofrecérselos invita a exportar un
 * recorte que no corresponde a ningún período fiscal.
 *
 * "Mes anterior" es el caso REAL de uso —se cierra el mes y se le manda todo
 * al contador— y por eso está primero.
 */
export const PERIODOS_EXPORTACION = [
  { valor: "mes_anterior", etiqueta: "Mes anterior" },
  { valor: "mes", etiqueta: "Mes actual" },
  { valor: "anio", etiqueta: "Año en curso" },
] as const;

export type PeriodoExportacion =
  (typeof PERIODOS_EXPORTACION)[number]["valor"];

export const PERIODO_EXPORTACION_DEFAULT: PeriodoExportacion = "mes_anterior";

/** Fail-closed al mes anterior: es el período cerrado, el único que no se
 * sigue moviendo mientras el contador trabaja sobre él. */
export function normalizarPeriodoExportacion(
  valor: unknown,
): PeriodoExportacion {
  return PERIODOS_EXPORTACION.some((p) => p.valor === valor)
    ? (valor as PeriodoExportacion)
    : PERIODO_EXPORTACION_DEFAULT;
}

/**
 * El mes calendario anterior COMPLETO: del 1 al último día.
 *
 * NO se usa `resolverRangoAnterior("mes")` de shared, y la diferencia importa:
 * esa función recorta al mismo día del mes a propósito, porque el panel
 * compara "mes a la fecha contra los mismos días del mes pasado". Correcto
 * para comparar; para exportar significaría que un contador que pide julio un
 * 8 de agosto se lleva del 1 al 8 de julio y presenta un mes incompleto.
 *
 * El día 0 del mes siguiente es el último del anterior, y así el 28/29/30/31
 * sale solo sin tener que saber de febrero ni de años bisiestos.
 */
function mesAnteriorCompleto(ahora: Date): RangoFechas {
  return {
    inicio: new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1, 0, 0, 0, 0),
    fin: new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59, 999),
  };
}

function finDelDia(fecha: Date): Date {
  return new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate(),
    23,
    59,
    59,
    999,
  );
}

/**
 * "Mes actual" y "Año en curso" son de CALENDARIO: desde el día 1 y desde el 1
 * de enero, hasta hoy.
 *
 * Salían de `resolverRangoActual("mes"|"anio")` de shared, que hasta que el
 * panel pasó a ventanas móviles significaba exactamente eso. Ahora esa función
 * devuelve los últimos 28 y 364 días, así que un contador que pidiera "Mes
 * actual" un 25 de agosto se habría llevado del 29 de julio al 25 de agosto
 * rotulado como el mes. Se calcula acá, que es donde vive el criterio contable
 * — igual que `mesAnteriorCompleto`, y por el mismo motivo.
 */
function desdeElInicioDe(unidad: "mes" | "anio", ahora: Date): RangoFechas {
  return {
    inicio:
      unidad === "anio"
        ? new Date(ahora.getFullYear(), 0, 1)
        : new Date(ahora.getFullYear(), ahora.getMonth(), 1),
    fin: finDelDia(ahora),
  };
}

export function rangoDeExportacion(
  periodo: unknown,
  ahora: Date = new Date(),
): RangoFechas {
  const p = normalizarPeriodoExportacion(periodo);
  if (p === "mes_anterior") return mesAnteriorCompleto(ahora);
  if (p === "anio") return desdeElInicioDe("anio", ahora);
  return desdeElInicioDe("mes", ahora);
}
