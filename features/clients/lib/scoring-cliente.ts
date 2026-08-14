/**
 * Scoring de clientes: UN número de 1 a 100.
 *
 * ---------------------------------------------------------------------------
 * EL MODELO, y por qué es así
 *
 * El puntaje arranca en 100 y baja solo con lo que sale mal. No suma puntos
 * por portarse bien, y esa asimetría es deliberada: pagar cuando corresponde
 * no es un mérito extra, es lo esperado. Consecuencias directas:
 *
 * - El que compró UNA vez y pagó de contado tiene 100. No debe nada, nunca se
 *   atrasó: no hay ninguna razón para puntuarlo por debajo del ideal. Que haya
 *   comprado poco no es un defecto, es poca información — y la falta de
 *   información no es una falta.
 * - El que sacó algo en cuenta corriente y lo pagó en término también tiene
 *   100, por lo mismo.
 *
 * El VALOR (recencia, frecuencia, margen) no compite con el riesgo ni se
 * promedia con él: AMORTIGUA el castigo. Un cliente que se atrasa pero es de
 * los que más margen dejan pierde menos puntos que uno que se atrasa igual y
 * casi no compra. Es la decisión comercial real —"le fío igual porque es mi
 * mejor cliente"— puesta en el número.
 *
 * Por eso el valor nunca baja el puntaje por sí solo: sin nada que amortiguar,
 * no hace nada. Si restara, el cliente chico y cumplidor terminaría peor
 * puntuado que el grande y moroso, que es exactamente al revés de lo que hay
 * que decidir.
 * ---------------------------------------------------------------------------
 *
 * LO QUE NO SE PUEDE SABER: el sistema no imputa cada pago a una deuda
 * puntual —los cobros de cuenta corriente son "a cuenta", no contra una venta—
 * así que "pagos en término" no se puede calcular en sentido estricto. Lo que
 * se reconstruye son los EPISODIOS de deuda: el saldo cruza de cero a positivo
 * y vuelve a cero. Un episodio que duró más que el plazo es un atraso, y se
 * sabe de cuántos días. Es fiel a lo que pasó sin inventar una imputación que
 * no existe.
 *
 * Puro y sin IO: recibe todo resuelto y la fecha por parámetro, así la matriz
 * entera se testea sin base y sin reloj.
 */

/** Plazo típico de una cuenta corriente. Un episodio más largo que esto es un
 * atraso: no hay vencimiento guardado por episodio, así que el plazo es la
 * referencia. */
const PLAZO_DIAS = 30;

/** Cuánto puede amortiguar el mejor cliente. 30% y no más: que sea valioso
 * explica darle otra oportunidad, no que el atraso no haya existido. */
const AMORTIGUACION_MAXIMA = 0.3;

export interface MovimientoCuenta {
  tipo: "DEBITO" | "CREDITO";
  monto: number;
  fecha: string;
  anulado?: boolean;
}

export interface VentaDelCliente {
  fecha: string;
  total: number;
  /** Costo de lo vendido. Permite puntuar por MARGEN y no por facturación: un
   * cliente que compra mucho de lo que menos deja no es el mejor cliente. */
  costo?: number;
}

export interface DatosScoring {
  movimientos: MovimientoCuenta[];
  ventas: VentaDelCliente[];
  saldoActual: number;
  fechaVencimientoDeuda: string | null;
  limiteCredito: number | null;
  clienteDesde: string;
  tuvoRecargoMora: boolean;
}

export interface EpisodioDeuda {
  inicio: string;
  /** null = sigue abierto hoy. */
  cierre: string | null;
  duracionDias: number;
}

export type NivelScoring = "excelente" | "bueno" | "regular" | "riesgoso";

export interface ScoringCliente {
  /** 1 a 100. Siempre hay número: no deber nada es información, no ausencia
   * de ella. */
  puntaje: number;
  nivel: NivelScoring;
  /** Qué lo bajó (o qué lo sostiene), en orden de peso. */
  factores: string[];
  /** Episodios de deuda cerrados. Es la confianza en el número, no el número:
   * la UI lo usa para decir "sobre 2 cuentas cerradas". */
  episodios: number;
  /** Pagos consecutivos en término. Lo que permite recuperarse. */
  rachaEnTermino: number;
  /** 0 a 1. Cuánto amortiguó el valor del cliente. Se expone para poder
   * explicar por qué dos morosos iguales puntúan distinto. */
  amortiguacion: number;
}

const DIA_MS = 86_400_000;

function dias(desde: string, hasta: string): number {
  const a = new Date(desde);
  const b = new Date(hasta);
  return Math.round(
    (Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) -
      Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) /
      DIA_MS,
  );
}

/**
 * Reconstruye los tramos en que el cliente tuvo deuda abierta.
 *
 * Cruzar de 0 a positivo abre un episodio; volver a 0 lo cierra. Los anulados
 * no cuentan: un movimiento anulado es uno que no pasó.
 */
export function reconstruirEpisodios(
  movimientos: MovimientoCuenta[],
  hoy: Date,
): EpisodioDeuda[] {
  const ordenados = [...movimientos]
    .filter((m) => !m.anulado)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const episodios: EpisodioDeuda[] = [];
  let saldo = 0;
  let inicio: string | null = null;

  for (const mov of ordenados) {
    const antes = saldo;
    saldo += mov.tipo === "DEBITO" ? mov.monto : -mov.monto;
    // Se redondea al peso: un resto de centavos por un recargo prorrateado
    // dejaría el episodio abierto para siempre.
    if (Math.abs(saldo) < 1) saldo = 0;

    if (antes <= 0 && saldo > 0) {
      inicio = mov.fecha;
    } else if (antes > 0 && saldo <= 0 && inicio) {
      episodios.push({
        inicio,
        cierre: mov.fecha,
        duracionDias: dias(inicio, mov.fecha),
      });
      inicio = null;
    }
  }

  if (inicio) {
    episodios.push({
      inicio,
      cierre: null,
      duracionDias: dias(inicio, hoy.toISOString()),
    });
  }

  return episodios;
}

/**
 * Peso por recencia: un atraso de hace un año no dice lo mismo que uno del mes
 * pasado. Cae a la mitad cada 6 meses y nunca llega a cero — el pasado pesa
 * menos, no desaparece.
 */
function pesoPorRecencia(fecha: string, hoy: Date): number {
  const meses = dias(fecha, hoy.toISOString()) / 30;
  return Math.max(0.15, 0.5 ** (meses / 6));
}

/**
 * Qué tan valioso es el cliente, de 0 a 1. Solo se usa para amortiguar.
 *
 * La inactividad pesa fuerte: alguien que fue muy bueno pero hace ocho meses
 * no aparece ya no es un cliente que convenga cuidar con más crédito.
 */
function factorValor(
  datos: DatosScoring,
  hoy: Date,
  referencia: { margenMaximo: number; comprasMaximas: number },
): number {
  if (datos.ventas.length === 0) return 0;

  const ultima = datos.ventas.map((v) => v.fecha).sort().at(-1)!;
  const diasSinComprar = dias(ultima, hoy.toISOString());

  let recencia: number;
  if (diasSinComprar <= 30) recencia = 1;
  else if (diasSinComprar <= 60) recencia = 0.8;
  else if (diasSinComprar <= 120) recencia = 0.5;
  else if (diasSinComprar <= 240) recencia = 0.2;
  else recencia = 0;

  const frecuencia = Math.min(
    1,
    datos.ventas.length / Math.max(1, referencia.comprasMaximas),
  );

  const margen = datos.ventas.reduce(
    (suma, v) => suma + (v.total - (v.costo ?? 0)),
    0,
  );
  const monto = Math.min(1, margen / Math.max(1, referencia.margenMaximo));

  // La recencia manda: sin ella, frecuencia y margen describen a un cliente
  // que ya no está.
  return recencia * (0.4 + 0.3 * frecuencia + 0.3 * monto);
}

export function calcularScoringCliente(
  datos: DatosScoring,
  hoy: Date,
  referencia: { margenMaximo: number; comprasMaximas: number },
): ScoringCliente {
  const episodios = reconstruirEpisodios(datos.movimientos, hoy);
  const cerrados = episodios.filter((e) => e.cierre !== null);

  // El episodio ABIERTO cuenta como atraso si ya pasó el plazo, y esto es lo
  // que arregla el error más grave que tuvo este modelo: mirando solo los
  // cerrados, el cliente que NUNCA pagó no tenía ningún episodio, así que "se
  // atrasó 0 de 0 veces" no lo castigaba. Un caso real de Evens —$70.100 hace
  // 153 días, un cargo y cero pagos— puntuaba 80, mejor que alguien que pagó
  // tarde pero pagó. Deber y no haber pagado nunca es la PEOR señal posible,
  // no la ausencia de señal.
  const abierto = episodios.find((e) => e.cierre === null);
  const abiertoAtrasado =
    abierto && abierto.duracionDias > PLAZO_DIAS ? abierto : null;

  const evaluables = abiertoAtrasado ? [...cerrados, abiertoAtrasado] : cerrados;
  const atrasados = evaluables.filter((e) => e.duracionDias > PLAZO_DIAS);
  const factores: string[] = [];

  // Racha: episodios cerrados en término desde el más reciente hacia atrás.
  let racha = 0;
  for (let i = cerrados.length - 1; i >= 0; i--) {
    if (cerrados[i].duracionDias > PLAZO_DIAS) break;
    racha += 1;
  }

  // CASTIGOS. Todo lo que sigue RESTA; nada suma.
  let castigo = 0;

  // 1. Puntualidad — el de mayor peso. Hasta 40.
  //
  // Se mide sobre `evaluables`, que incluye la deuda abierta y vencida: si no,
  // el que debe hace medio año y no pagó nunca queda con denominador cero.
  if (evaluables.length > 0 && atrasados.length > 0) {
    const proporcion = atrasados.length / evaluables.length;
    castigo += proporcion * 40;

    const cerradosAtrasados = atrasados.filter((e) => e.cierre !== null).length;
    factores.push(
      cerradosAtrasados > 0
        ? `Pagó fuera de término ${cerradosAtrasados} de ${cerrados.length} veces`
        : "Todavía no pagó lo que debe",
    );
  }

  // 2. Atraso promedio, ponderado por recencia. Hasta 20.
  //
  // El peso se aplica DOS veces y no es redundante: al promedio (para que un
  // atraso viejo no infle "cuántos días tarda") y al castigo. Sin lo segundo,
  // dos atrasos de 90 días —uno de hace dos años, otro del mes pasado—
  // castigan igual porque los dos saturan el tope, que es justo la distinción
  // que se quiere hacer.
  if (atrasados.length > 0) {
    let sumaPesos = 0;
    let sumaAtrasos = 0;
    for (const episodio of atrasados) {
      // El episodio abierto se pondera como si fuera de HOY: está pasando
      // ahora, no es historia.
      const peso = episodio.cierre
        ? pesoPorRecencia(episodio.cierre, hoy)
        : 1;
      sumaPesos += peso;
      sumaAtrasos += (episodio.duracionDias - PLAZO_DIAS) * peso;
    }
    const promedio = sumaPesos > 0 ? sumaAtrasos / sumaPesos : 0;
    const pesoPromedio = sumaPesos / atrasados.length;
    const parcial = Math.min(1, promedio / 60) * 20 * pesoPromedio;
    castigo += parcial;
    if (parcial >= 1) {
      factores.push(`Cuando se atrasa, tarda ~${Math.round(promedio)} días de más`);
    }
  }

  // 3. Peor atraso histórico. Hasta 10. Un solo evento de 90 días pesa
  // distinto que muchos de 5, y el promedio solo no lo captura.
  const peor = Math.max(0, ...atrasados.map((e) => e.duracionDias - PLAZO_DIAS));
  if (peor > 0) {
    castigo += Math.min(1, peor / 120) * 10;
    if (peor >= 60) factores.push(`Su peor atraso fue de ${peor} días`);
  }

  // 4. Aging de la deuda de HOY. Hasta 35, y sigue subiendo después de los 90
  // días en vez de topear ahí.
  //
  // Antes topeaba en 20 a los 91 días, así que deber hace tres meses y deber
  // hace un año costaban lo mismo — y con eso, alguien con 153 días de mora
  // llegaba a 80 puntos. Es lo único del modelo que mira el PRESENTE: no es un
  // antecedente, es plata que no está.
  const atraso =
    datos.fechaVencimientoDeuda && datos.saldoActual > 0
      ? Math.max(0, dias(datos.fechaVencimientoDeuda, hoy.toISOString()))
      : 0;
  if (atraso > 0) {
    const porAging =
      atraso > 180 ? 35 : atraso > 90 ? 30 : atraso > 60 ? 20 : atraso > 30 ? 12 : 6;
    castigo += porAging;
    factores.unshift(`Debe hace ${atraso} días`);
  }

  // 5. Utilización del límite. Hasta 10.
  if (datos.limiteCredito && datos.limiteCredito > 0 && datos.saldoActual > 0) {
    const uso = datos.saldoActual / datos.limiteCredito;
    if (uso >= 0.9) {
      castigo += 10;
      factores.push(`Usó el ${Math.round(uso * 100)}% de su límite`);
    } else if (uso >= 0.7) {
      castigo += 5;
    }
  }

  // 6. Sobreexposición en tickets. Hasta 10. El problema no es el monto, sino
  // que no lo puede cubrir comprando como compra siempre.
  const ticketPromedio =
    datos.ventas.length > 0
      ? datos.ventas.reduce((s, v) => s + v.total, 0) / datos.ventas.length
      : 0;
  if (ticketPromedio > 0 && datos.saldoActual > 0) {
    const tickets = datos.saldoActual / ticketPromedio;
    if (tickets >= 12) {
      castigo += 10;
      factores.push(`Debe el equivalente a ${Math.round(tickets)} compras suyas`);
    } else if (tickets >= 6) {
      castigo += 5;
    }
  }

  // 7. Recargo por mora cobrado. 5. Es un hecho, no una interpretación: el
  // comercio ya decidió que ese atraso ameritaba cobrarlo.
  if (datos.tuvoRecargoMora) {
    castigo += 5;
    factores.push("Se le cobró recargo por mora");
  }

  // AMORTIGUACIÓN por valor. Solo reduce el castigo, nunca lo crea: un cliente
  // sin problemas queda en 100 aunque casi no compre.
  const valor = factorValor(datos, hoy, referencia);
  const amortiguacion = castigo > 0 ? valor * AMORTIGUACION_MAXIMA : 0;
  const castigoFinal = castigo * (1 - amortiguacion);

  if (amortiguacion >= 0.15) {
    factores.push("Compensa: es de los clientes que más te dejan");
  }

  const puntaje = Math.max(1, Math.min(100, Math.round(100 - castigoFinal)));

  // La racha se informa como explicación, no como puntos: el que viene pagando
  // bien ya no tiene castigo que descontar, así que sumarle sería premiarlo
  // dos veces.
  if (racha >= 3 && castigo === 0) {
    factores.unshift(`${racha} pagos seguidos en término`);
  }

  if (factores.length === 0) {
    factores.push(
      cerrados.length > 0
        ? "Siempre pagó en término"
        : datos.ventas.length > 0
          ? "Compró de contado: nunca te debió nada"
          : "Todavía no compró",
    );
  }

  return {
    puntaje,
    nivel: nivelDeScoring(puntaje),
    factores,
    episodios: cerrados.length,
    rachaEnTermino: racha,
    amortiguacion,
  };
}

export function nivelDeScoring(puntaje: number): NivelScoring {
  if (puntaje >= 80) return "excelente";
  if (puntaje >= 60) return "bueno";
  if (puntaje >= 40) return "regular";
  return "riesgoso";
}
