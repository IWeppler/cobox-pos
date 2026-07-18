// Español + inglés: Excel/Sheets autoformatea fechas cortas con la
// abreviatura de mes en el idioma de configuración regional de la
// planilla, no necesariamente el del sistema. "mar/may/jun/jul/sep/oct/nov"
// coinciden en ambos idiomas; el resto no ("ago" vs "aug", "dic" vs "dec").
const MESES_ABREV: Record<string, number> = {
  ene: 1,
  jan: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12,
};

// Rechaza fechas "desbordadas" que Date normaliza en vez de rechazar
// (ej. 31/02/2026 -> 03/03/2026).
function construirFechaISO(anio: number, mes: number, dia: number): string | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Parsea una fecha en formato DD/MM/YYYY (o DD-MM-YYYY) — la convención
 * que usa el resto del sistema (formatearFechaHora, "Última compra" en
 * clients-view.tsx) — o en formato "D-MMM"/"DD-MMM" con mes abreviado en
 * español o inglés y sin año (ej. "13-ago" o "13-Aug"), que es como
 * Excel/Sheets autoformatea una celda de fecha corta al exportar a CSV
 * según el idioma regional de la planilla. En ese caso se asume el año
 * calendario actual: son fechas de vencimiento de deuda siempre cercanas,
 * no a años vista, así que no hace falta rollover a año siguiente.
 * Devuelve null ante cualquier formato no reconocido en vez de lanzar:
 * mismo criterio de tolerancia que ya usa el resto del parser de CSV (una
 * columna opcional mal cargada no aborta la fila).
 */
export function parseFechaDDMMYYYY(raw: string): string | null {
  const limpio = raw?.trim().replace(/^["']|["']$/g, "");
  if (!limpio) return null;

  const match = limpio.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const anio = Number(match[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return construirFechaISO(anio, mes, dia);
  }

  const matchAbrev = limpio.match(/^(\d{1,2})-([a-záéíóúñ]{3,4})\.?$/i);
  if (matchAbrev) {
    const dia = Number(matchAbrev[1]);
    const mes = MESES_ABREV[matchAbrev[2].toLowerCase()];
    if (!mes || dia < 1 || dia > 31) return null;
    return construirFechaISO(new Date().getFullYear(), mes, dia);
  }

  return null;
}
