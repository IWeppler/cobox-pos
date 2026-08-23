/**
 * ARPU, churn, LTV y margen sobre la infraestructura.
 *
 * Lo más importante de este módulo NO es cómo se calculan, sino cuándo se
 * NIEGA a calcularlos. Con 4 comercios y una baja, un churn de "25% mensual"
 * es aritmética correcta y estadística sin sentido: proyectado da que el
 * negocio se termina en cuatro meses. Un número así, mostrado en un tablero,
 * se convierte en una decisión.
 *
 * Por eso cada métrica devuelve `null` cuando la muestra no alcanza, y la UI
 * muestra el motivo en lugar del número. Un "—" con una explicación es
 * información; un 25% inventado es desinformación con dos decimales.
 *
 * Puro y sin IO: recibe todo resuelto y se testea sin base ni reloj.
 */

/** Debajo de esto no se publica churn ni LTV. Con menos comercios, una sola
 * baja mueve la tasa decenas de puntos. */
export const MINIMO_PARA_CHURN = 10;

export interface NegocioParaMetricas {
  estado: string;
  created_at: string;
  /** Cuándo pasó a su estado actual. Es lo que fecha una baja. */
  estado_cambiado_en: string | null;
}

export interface MetricaConMotivo {
  valor: number | null;
  /** Por qué no hay número. Se muestra tal cual en la UI. */
  motivo?: string;
}

/**
 * Ingreso promedio por comercio activo, sobre lo COBRADO en el mes.
 *
 * No usa el precio de lista: un comercio con plan asignado que hace tres meses
 * no paga aporta $0 al ARPU real, aunque sume al MRR teórico.
 */
export function calcularArpu(
  cobradoEnElMes: number,
  comerciosActivos: number,
): MetricaConMotivo {
  if (comerciosActivos <= 0) {
    return { valor: null, motivo: "Todavía no hay comercios activos." };
  }
  return { valor: cobradoEnElMes / comerciosActivos };
}

/**
 * Churn mensual: qué proporción de los que estaban al empezar el mes se fue.
 *
 * La base es "activos al inicio del período", no "activos hoy": dividir por el
 * final ya descuenta a los que se fueron y da una tasa más baja que la real.
 */
export function calcularChurnMensual(
  negocios: NegocioParaMetricas[],
  mes: Date,
): MetricaConMotivo {
  const inicio = new Date(
    Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), 1),
  );
  const fin = new Date(
    Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 1),
  );

  const activosAlInicio = negocios.filter((n) => {
    const alta = new Date(n.created_at);
    if (alta >= inicio) return false;
    // Ya estaba de baja antes de que arrancara el mes: no formaba parte del
    // universo que podía irse.
    if (n.estado === "baja" && n.estado_cambiado_en) {
      return new Date(n.estado_cambiado_en) >= inicio;
    }
    return true;
  }).length;

  if (activosAlInicio < MINIMO_PARA_CHURN) {
    return {
      valor: null,
      motivo: `Hacen falta al menos ${MINIMO_PARA_CHURN} comercios para que la tasa signifique algo (hay ${activosAlInicio}).`,
    };
  }

  const bajasDelMes = negocios.filter((n) => {
    if (n.estado !== "baja" || !n.estado_cambiado_en) return false;
    const cuando = new Date(n.estado_cambiado_en);
    return cuando >= inicio && cuando < fin;
  }).length;

  return { valor: (bajasDelMes / activosAlInicio) * 100 };
}

/**
 * LTV = ARPU / churn mensual.
 *
 * Sin churn medible no hay LTV: la fórmula divide por la tasa de bajas, así
 * que con churn 0 el resultado es infinito. "Cada cliente vale infinito" es
 * literalmente lo que dice la cuenta cuando todavía no se fue nadie, y no es
 * un dato — es la ausencia de uno.
 */
export function calcularLtv(
  arpu: MetricaConMotivo,
  churnMensual: MetricaConMotivo,
): MetricaConMotivo {
  if (arpu.valor === null) {
    return { valor: null, motivo: arpu.motivo };
  }
  if (churnMensual.valor === null) {
    return { valor: null, motivo: churnMensual.motivo };
  }
  if (churnMensual.valor <= 0) {
    return {
      valor: null,
      motivo: "Todavía no se fue ningún comercio: sin bajas no se puede estimar.",
    };
  }
  return { valor: arpu.valor / (churnMensual.valor / 100) };
}

export interface CostoInfra {
  /** Qué se gastó. Antes era el proveedor (Vercel, Supabase); ahora es
   * cualquier concepto, porque los gastos dejaron de ser solo infra. */
  concepto: string;
  monto: number;
}

export interface ResumenCostos {
  total: number;
  porComercio: number | null;
  /** Lo cobrado menos lo que cuesta la infraestructura. Puede ser negativo, y
   * mostrarlo así es el punto: es el número que dice si el precio alcanza. */
  margen: number;
  margenPorcentaje: number | null;
  detalle: CostoInfra[];
}

export function resumirCostos(
  costos: CostoInfra[],
  cobradoEnElMes: number,
  comerciosActivos: number,
): ResumenCostos {
  const total = costos.reduce((suma, c) => suma + c.monto, 0);

  return {
    total,
    porComercio: comerciosActivos > 0 ? total / comerciosActivos : null,
    margen: cobradoEnElMes - total,
    // Sin ingresos no hay porcentaje: dividir por cero daría -Infinity y
    // "-∞% de margen" no le dice nada a nadie.
    margenPorcentaje:
      cobradoEnElMes > 0
        ? ((cobradoEnElMes - total) / cobradoEnElMes) * 100
        : null,
    detalle: costos,
  };
}
