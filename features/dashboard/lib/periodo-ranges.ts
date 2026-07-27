export type PeriodoPanel = "hoy" | "semana" | "mes";

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
  return {
    inicio: new Date(ahora.getFullYear(), ahora.getMonth(), 1),
    fin: finDelDia(ahora),
  };
}

/**
 * Rango de comparación — SIEMPRE el mismo tramo relativo del período
 * anterior equivalente, nunca "el día calendario inmediato anterior" (un
 * domingo vs. sábado da rojo falso). Para "hoy"/"semana" alcanza con
 * restar 7 días exactos a ambos extremos: preserva el día de la semana
 * automáticamente (mismo día de semana vs. mismo día de semana anterior;
 * mismo tramo lunes→hoy vs. lunes→mismo día de la semana pasada). Para
 * "mes" no hay un shift fijo posible (meses de distinta longitud) — se usa
 * el mismo día-del-mes en el mes calendario anterior, clampeado a la
 * cantidad de días que ese mes realmente tiene.
 */
export function resolverRangoAnterior(
  periodo: PeriodoPanel,
  ahora: Date,
): RangoFechas {
  if (periodo === "hoy" || periodo === "semana") {
    const actual = resolverRangoActual(periodo, ahora);
    const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
    return {
      inicio: new Date(actual.inicio.getTime() - SIETE_DIAS_MS),
      fin: new Date(actual.fin.getTime() - SIETE_DIAS_MS),
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
  if (periodo === "mes") return resolverRangoActual("mes", ahora);
  return resolverRangoActual("semana", ahora);
}

export function formatearFechaISO(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const d = fecha.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** % de variación contra el período anterior. Si el período anterior fue 0
 * (sin datos), no hay variación calculable — no inventamos un +100%. */
export function calcularCrecimiento(actual: number, anterior: number): number {
  if (anterior <= 0) return 0;
  return ((actual - anterior) / anterior) * 100;
}
