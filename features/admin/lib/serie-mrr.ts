/**
 * Serie mensual de ingresos para el gráfico del panel.
 *
 * Se arma con los PAGOS REALES (`pagos_suscripcion`), no con el MRR teórico
 * (la suma de los precios de lista de los planes activos). Son dos números
 * distintos y confundirlos es la forma más rápida de creerse una facturación
 * que no entró: el MRR teórico cuenta al comercio que hace tres meses no paga.
 *
 * El MRR teórico igual se muestra, pero como número aparte y con su nombre.
 *
 * Puro: recibe los pagos y la fecha de corte, así el armado de la serie se
 * testea sin base y sin reloj.
 */

export interface PagoParaSerie {
  monto: number;
  /** "YYYY-MM-DD". Se agrupa por el mes en que ENTRÓ la plata, no por el
   * período que cubre: el gráfico responde "cuánto entró en marzo". */
  fecha_pago: string;
}

export interface PuntoMrr {
  /** "YYYY-MM", para ordenar sin ambigüedad. */
  mes: string;
  /** "mar 26", para el eje. */
  etiqueta: string;
  total: number;
  pagos: number;
}

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function etiquetaDeMes(anio: number, mes: number): string {
  return `${MESES[mes]} ${String(anio).slice(2)}`;
}

/**
 * Los últimos N meses hasta `hasta`, incluido.
 *
 * Los meses SIN pagos se devuelven en cero en vez de omitirse: un hueco en la
 * serie se lee como "no hay dato", y un mes sin cobrar es un dato importante.
 */
export function construirSerieMrr(
  pagos: PagoParaSerie[],
  hasta: Date,
  meses = 12,
): PuntoMrr[] {
  const acumulado = new Map<string, { total: number; pagos: number }>();

  for (const pago of pagos) {
    const mes = String(pago.fecha_pago).slice(0, 7);
    const actual = acumulado.get(mes) ?? { total: 0, pagos: 0 };
    actual.total += Number(pago.monto) || 0;
    actual.pagos += 1;
    acumulado.set(mes, actual);
  }

  const serie: PuntoMrr[] = [];
  // UTC de punta a punta, igual que el resto: con getMonth() local, un pago
  // del día 1 a la madrugada cae en el mes anterior.
  const anioFin = hasta.getUTCFullYear();
  const mesFin = hasta.getUTCMonth();

  for (let i = meses - 1; i >= 0; i--) {
    const fecha = new Date(Date.UTC(anioFin, mesFin - i, 1));
    const anio = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth();
    const clave = `${anio}-${String(mes + 1).padStart(2, "0")}`;
    const datos = acumulado.get(clave) ?? { total: 0, pagos: 0 };

    serie.push({
      mes: clave,
      etiqueta: etiquetaDeMes(anio, mes),
      total: datos.total,
      pagos: datos.pagos,
    });
  }

  return serie;
}

/** Variación contra el mes anterior, en porcentaje. `null` cuando no hay base
 * de comparación: mostrar "+100%" porque el mes pasado fue cero es un número
 * que no significa nada. */
export function variacionMensual(serie: PuntoMrr[]): number | null {
  if (serie.length < 2) return null;
  const actual = serie[serie.length - 1].total;
  const previo = serie[serie.length - 2].total;
  if (previo === 0) return null;
  return ((actual - previo) / previo) * 100;
}
