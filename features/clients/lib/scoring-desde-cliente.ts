import {
  calcularScoringCliente,
  type ScoringCliente,
} from "./scoring-cliente";

/**
 * Adaptador entre lo que devuelve la consulta de clientes y lo que necesita el
 * scoring.
 *
 * Vive aparte de `scoring-cliente.ts` para que ese módulo siga sin saber nada
 * de Supabase ni de la forma de las filas: la matriz de puntajes se testea con
 * objetos simples, y acá se concentra el mapeo, que es lo que se rompe cuando
 * alguien cambia un `select`.
 */

interface VentaFila {
  total?: number | string | null;
  /** Costo TOTAL de la venta: cada renglón ya viene multiplicado por su
   * cantidad. NO multiplicar por `cantidad` — ese comentario decía "unitario"
   * y por eso se hacía. */
  precio_costo?: number | string | null;
  /** Unidades del ticket. No entra en el margen; queda porque la consulta la
   * trae y otras vistas la usan. */
  cantidad?: number | string | null;
  fecha_venta?: string | null;
}

interface MovimientoFila {
  tipo?: string | null;
  monto?: number | string | null;
  creado_en?: string | null;
  /** Fecha real del movimiento cuando se cargó a mano con otra fecha (un saldo
   * inicial que corresponde a marzo, cargado en agosto). Manda sobre
   * `creado_en`: el episodio de deuda empezó cuando de verdad empezó. */
  fecha_origen?: string | null;
  anulado?: boolean | null;
  descripcion?: string | null;
}

export interface ClienteParaScoring {
  saldo_pendiente?: number | string | null;
  fecha_vencimiento_deuda?: string | null;
  creado_en?: string | null;
  reglas_credito?: { limite?: number | null } | null;
  ventas?: VentaFila[] | null;
  cuenta_corriente_movimientos?: MovimientoFila[] | null;
}

export interface ReferenciaScoring {
  margenMaximo: number;
  comprasMaximas: number;
}

/**
 * La referencia contra la que se compara el valor: el mejor cliente de ESTE
 * comercio, no un número absoluto.
 *
 * Sin esto, "$200.000 de margen" no dice si es mucho o poco — depende de si el
 * resto deja $20.000 o $2.000.000.
 */
export function calcularReferencia(
  clientes: ClienteParaScoring[],
): ReferenciaScoring {
  let margenMaximo = 0;
  let comprasMaximas = 0;

  for (const cliente of clientes) {
    const ventas = cliente.ventas ?? [];
    comprasMaximas = Math.max(comprasMaximas, ventas.length);
    margenMaximo = Math.max(
      margenMaximo,
      ventas.reduce((suma, v) => suma + margenDeVenta(v), 0),
    );
  }

  return { margenMaximo, comprasMaximas };
}

/**
 * ¿Alguna vez se le cobró recargo por mora?
 *
 * Se detecta por la descripción del DEBITO, que es donde vive el dato: el
 * recargo se materializa como un movimiento propio desde que se arregló la
 * imputación (ver manage-clients.ts). No hay una columna `tipo = MORA`, y
 * agregarla obligaría a migrar el historial para llenarla con algo que no se
 * puede reconstruir.
 *
 * Antes de esa fecha el recargo vivía como texto adentro de la descripción del
 * PAGO, así que tampoco hay señal: para el historial viejo esto devuelve
 * false, que es el default benigno. Un cliente no puede quedar peor puntuado
 * por un dato que el sistema no guardaba.
 */
function tuvoRecargoDeMora(movimientos: MovimientoFila[]): boolean {
  return movimientos.some(
    (m) =>
      m.tipo === "DEBITO" &&
      !m.anulado &&
      /recargo por mora/i.test(m.descripcion ?? ""),
  );
}

function margenDeVenta(venta: VentaFila): number {
  const total = Number(venta.total) || 0;
  // `ventas.precio_costo` es el costo TOTAL de la venta, no el unitario: cada
  // renglón ya entra multiplicado por su cantidad. Acá se llamaba
  // "costoUnitario" y se volvía a multiplicar por `venta.cantidad`, así que el
  // costo quedaba inflado tantas veces como renglones tuviera el ticket — y el
  // margen, hundido. Afectaba a las 226 ventas de más de un renglón, que son
  // justo las de los clientes que más compran.
  const costoTotal = Number(venta.precio_costo) || 0;
  // Sin costo cargado el margen es el total: es optimista, pero puntuar en
  // cero a todo un catálogo sin costos haría que el valor no sirva para nada.
  return costoTotal > 0 ? total - costoTotal : total;
}

export function scoringDesdeCliente(
  cliente: ClienteParaScoring,
  referencia: ReferenciaScoring,
  hoy: Date,
): ScoringCliente {
  const ventas = (cliente.ventas ?? [])
    .filter((v) => v.fecha_venta)
    .map((v) => ({
      fecha: v.fecha_venta as string,
      total: Number(v.total) || 0,
      // Total, no unitario — mismo motivo que en `margenDeVenta`.
      costo: Number(v.precio_costo) || 0,
    }));

  const movimientos = (cliente.cuenta_corriente_movimientos ?? [])
    .filter((m) => m.tipo === "DEBITO" || m.tipo === "CREDITO")
    .map((m) => ({
      tipo: m.tipo as "DEBITO" | "CREDITO",
      monto: Number(m.monto) || 0,
      fecha: (m.fecha_origen || m.creado_en) as string,
      anulado: Boolean(m.anulado),
    }))
    .filter((m) => Boolean(m.fecha));

  return calcularScoringCliente(
    {
      movimientos,
      ventas,
      saldoActual: Number(cliente.saldo_pendiente) || 0,
      fechaVencimientoDeuda: cliente.fecha_vencimiento_deuda ?? null,
      limiteCredito: cliente.reglas_credito?.limite ?? null,
      clienteDesde: cliente.creado_en ?? new Date().toISOString(),
      tuvoRecargoMora: tuvoRecargoDeMora(
        cliente.cuenta_corriente_movimientos ?? [],
      ),
    },
    hoy,
    referencia,
  );
}
