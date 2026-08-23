/**
 * Cuánto se gastó en cada mes de la serie.
 *
 * La regla vive acá y no en la consulta porque un gasto FIJO no tiene una fila
 * por mes: tiene UNA fila que aplica a un rango. Cuánto pesa en marzo es una
 * cuenta, no un dato guardado — y por eso se puede testear sin base.
 */

export interface GastoParaSerie {
  tipo: "FIJO" | "UNICO";
  /** "YYYY-MM-DD". Para UNICO es su mes; para FIJO, el primero en que aplica. */
  mes: string;
  /** Último mes en que aplica un FIJO. Null = sigue vigente. */
  hasta: string | null;
  monto: number;
}

/** "YYYY-MM" de una fecha guardada como "YYYY-MM-DD". */
const claveMes = (fecha: string) => String(fecha).slice(0, 7);

/**
 * ¿Este gasto cuenta en este mes?
 *
 * - ÚNICO: solo en el suyo.
 * - FIJO: desde el suyo hasta `hasta` inclusive; sin `hasta`, para siempre.
 *
 * La comparación es de strings "YYYY-MM", que ordena igual que la fecha y no
 * necesita construir un Date por cada gasto y cada mes.
 */
export function gastoAplicaEnMes(
  gasto: GastoParaSerie,
  mes: string,
): boolean {
  const desde = claveMes(gasto.mes);

  if (gasto.tipo === "UNICO") return desde === mes;

  if (desde > mes) return false;
  return gasto.hasta === null || claveMes(gasto.hasta) >= mes;
}

/** Total gastado en un mes ("YYYY-MM"). */
export function totalGastadoEnMes(
  gastos: GastoParaSerie[],
  mes: string,
): number {
  return gastos
    .filter((g) => gastoAplicaEnMes(g, mes))
    .reduce((suma, g) => suma + (Number(g.monto) || 0), 0);
}

/** El total de cada mes de la serie, en el mismo orden. */
export function gastosPorMes(
  gastos: GastoParaSerie[],
  meses: string[],
): number[] {
  return meses.map((mes) => totalGastadoEnMes(gastos, mes));
}
