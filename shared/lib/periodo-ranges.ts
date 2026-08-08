export type PeriodoPanel = "hoy" | "semana" | "mes" | "anio";

export type RangoFechas = { inicio: Date; fin: Date };

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

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

// Semana de lunes a domingo (convención AR) — "esta semana" es de lunes
// hasta HOY (no hasta el domingo futuro), para poder comparar contra el
// mismo tramo relativo de la semana pasada sin inflar/desinflar por días
// que todavía no pasaron.
function inicioDeSemana(fecha: Date): Date {
  const d = inicioDelDia(fecha);
  const dia = d.getDay(); // 0=domingo … 6=sábado
  const diasDesdeLunes = dia === 0 ? 6 : dia - 1;
  d.setDate(d.getDate() - diasDesdeLunes);
  return d;
}

/**
 * Rango del período ACTUAL para el selector del panel. "Semana" y "mes" son
 * siempre "a la fecha" (desde el inicio del período hasta ahora) — nunca el
 * período completo futuro incluido.
 */
export function resolverRangoActual(
  periodo: PeriodoPanel,
  ahora: Date,
): RangoFechas {
  if (periodo === "hoy") {
    return { inicio: inicioDelDia(ahora), fin: finDelDia(ahora) };
  }
  if (periodo === "semana") {
    return { inicio: inicioDeSemana(ahora), fin: finDelDia(ahora) };
  }
  if (periodo === "anio") {
    return {
      inicio: new Date(ahora.getFullYear(), 0, 1),
      fin: finDelDia(ahora),
    };
  }
  return {
    inicio: new Date(ahora.getFullYear(), ahora.getMonth(), 1),
    fin: finDelDia(ahora),
  };
}

/**
 * Rango de comparación — el período inmediatamente anterior EQUIVALENTE, con
 * el mismo tramo relativo recorrido, para que a mitad de mes no se compare
 * medio mes contra un mes entero.
 *
 * - "hoy" → el día calendario anterior (ayer completo).
 * - "semana" → lunes→mismo día de la semana pasada (shift de 7 días exactos,
 *   que preserva el día de la semana automáticamente).
 * - "mes" → día 1 del mes anterior → mismo día-del-mes, clampeado a la
 *   cantidad de días que ese mes realmente tiene (31 de marzo → 28 de feb).
 * - "anio" → 1 de enero del año anterior → mismo día y mes del año anterior,
 *   con el mismo clamp (29 de febrero de un bisiesto → 28 de febrero).
 */
export function resolverRangoAnterior(
  periodo: PeriodoPanel,
  ahora: Date,
): RangoFechas {
  if (periodo === "hoy") {
    const ayer = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate() - 1,
    );
    return { inicio: inicioDelDia(ayer), fin: finDelDia(ayer) };
  }

  if (periodo === "semana") {
    const actual = resolverRangoActual(periodo, ahora);
    const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
    return {
      inicio: new Date(actual.inicio.getTime() - SIETE_DIAS_MS),
      fin: new Date(actual.fin.getTime() - SIETE_DIAS_MS),
    };
  }

  if (periodo === "anio") {
    const anioAnterior = ahora.getFullYear() - 1;
    const ultimoDiaDelMes = new Date(
      anioAnterior,
      ahora.getMonth() + 1,
      0,
    ).getDate();
    const diaClamped = Math.min(ahora.getDate(), ultimoDiaDelMes);
    return {
      inicio: new Date(anioAnterior, 0, 1),
      fin: new Date(
        anioAnterior,
        ahora.getMonth(),
        diaClamped,
        23,
        59,
        59,
        999,
      ),
    };
  }

  const inicioAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const ultimoDiaMesAnterior = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    0,
  ).getDate();
  const diaClamped = Math.min(ahora.getDate(), ultimoDiaMesAnterior);
  const finAnterior = new Date(
    ahora.getFullYear(),
    ahora.getMonth() - 1,
    diaClamped,
    23,
    59,
    59,
    999,
  );
  return { inicio: inicioAnterior, fin: finAnterior };
}

/** Ventana usada por los rankings de rotación/rentabilidad: SIEMPRE semanal
 * como mínimo (nunca diaria) — si el selector está en "Mes", usa ventana de
 * mes en su lugar. */
export function resolverRangoRanking(
  periodo: PeriodoPanel,
  ahora: Date,
): RangoFechas {
  if (periodo === "mes" || periodo === "anio") {
    return resolverRangoActual(periodo, ahora);
  }
  return resolverRangoActual("semana", ahora);
}

/** Cómo se nombra el período de comparación en la UI (KPIs y chart). */
/** Cómo se nombra el período en una frase ("acreditado {este mes}"). */
export const ETIQUETA_PERIODO: Record<PeriodoPanel, string> = {
  hoy: "hoy",
  semana: "esta semana",
  mes: "este mes",
  anio: "este año",
};

export const ETIQUETA_PERIODO_ANTERIOR: Record<PeriodoPanel, string> = {
  hoy: "ayer",
  semana: "semana anterior",
  mes: "mes anterior",
  anio: "año anterior",
};

export function formatearFechaISO(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const d = fecha.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** % de variación contra el período anterior. Si el período anterior fue 0
 * (sin datos), no hay variación calculable — devuelve null para que la UI
 * no muestre nada, en vez de un "+0%" verde que se lee como "igual que
 * antes" o un +100% inventado. */
export function calcularCrecimiento(
  actual: number,
  anterior: number,
): number | null {
  if (anterior <= 0) return null;
  return ((actual - anterior) / anterior) * 100;
}
