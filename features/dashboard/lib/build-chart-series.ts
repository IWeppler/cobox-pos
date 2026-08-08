import { Venta } from "@/entities/ventas/types";
import type { PeriodoPanel, RangoFechas } from "@/shared/lib/periodo-ranges";

export type Granularidad = "hora" | "dia" | "mes";

export type MetricaSerie = "ingresos" | "unidades" | "ganancia";

export type PuntoSerieComparada = {
  /** Etiqueta corta del eje X (viene del período ACTUAL). */
  etiqueta: string;
  /** Etiqueta larga para el tooltip, período actual. */
  etiquetaCompleta: string;
  /** Etiqueta larga para el tooltip, período anterior. null si ese tramo no
   * existe en el período anterior (mes actual más largo que el anterior). */
  etiquetaCompletaAnterior: string | null;
  ingresos: number;
  unidades: number;
  ganancia: number;
  ingresosAnterior: number | null;
  unidadesAnterior: number | null;
  gananciaAnterior: number | null;
};

/**
 * Granularidad del chart según el período del panel. Un solo día graficado
 * por día sería un único punto (no es una línea), y un año por día son 365
 * puntos ilegibles en mobile.
 */
export function granularidadPara(periodo: PeriodoPanel): Granularidad {
  if (periodo === "hoy") return "hora";
  if (periodo === "anio") return "mes";
  return "dia";
}

type Acumulador = { ingresos: number; unidades: number; ganancia: number };

function truncarABucket(fecha: Date, gran: Granularidad): Date {
  if (gran === "hora") {
    return new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      fecha.getHours(),
    );
  }
  if (gran === "mes") return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function siguienteBucket(fecha: Date, gran: Granularidad): Date {
  if (gran === "hora") {
    return new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      fecha.getHours() + 1,
    );
  }
  if (gran === "mes") {
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1);
  }
  // Construido por componentes (no sumando 24h) para no romperse con DST.
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1);
}

function claveBucket(fecha: Date, gran: Granularidad): string {
  const y = fecha.getFullYear();
  const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
  if (gran === "mes") return `${y}-${m}`;
  const d = fecha.getDate().toString().padStart(2, "0");
  if (gran === "dia") return `${y}-${m}-${d}`;
  const h = fecha.getHours().toString().padStart(2, "0");
  return `${y}-${m}-${d}T${h}`;
}

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function etiquetaCorta(fecha: Date, gran: Granularidad): string {
  if (gran === "hora") return `${fecha.getHours().toString().padStart(2, "0")}h`;
  if (gran === "mes") return MESES_CORTOS[fecha.getMonth()];
  return `${fecha.getDate().toString().padStart(2, "0")}/${(fecha.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function etiquetaLarga(fecha: Date, gran: Granularidad): string {
  const dm = `${fecha.getDate().toString().padStart(2, "0")}/${(
    fecha.getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}`;
  if (gran === "hora") {
    return `${dm} ${fecha.getHours().toString().padStart(2, "0")}:00`;
  }
  if (gran === "mes") {
    return `${MESES_CORTOS[fecha.getMonth()]} ${fecha.getFullYear()}`;
  }
  return `${dm}/${fecha.getFullYear()}`;
}

/**
 * Buckets que cubren el rango, alineados a la granularidad. El primero se
 * trunca hacia atrás (un rango que arranca el lunes 00:00 con granularidad
 * "mes" empieza en el día 1 del mes) y el último es el que contiene a `fin`.
 */
function generarBuckets(rango: RangoFechas, gran: Granularidad): Date[] {
  const buckets: Date[] = [];
  let cursor = truncarABucket(rango.inicio, gran);
  const finMs = rango.fin.getTime();

  while (cursor.getTime() <= finMs) {
    buckets.push(cursor);
    cursor = siguienteBucket(cursor, gran);
  }
  return buckets;
}

/**
 * Acumula ventas por bucket dentro de un rango. Las ventas fuera del rango
 * se descartan aunque caigan en un bucket que el rango toca parcialmente:
 * eso es lo que hace justa la comparación con el mes/año anterior (el
 * último bucket del período anterior está cortado en el mismo día).
 */
function acumularPorBucket(
  ventasOperativas: Venta[],
  rango: RangoFechas,
  gran: Granularidad,
): { buckets: Date[]; valores: Acumulador[] } {
  const buckets = generarBuckets(rango, gran);
  const indicePorClave = new Map<string, number>();
  buckets.forEach((b, i) => indicePorClave.set(claveBucket(b, gran), i));

  const valores: Acumulador[] = buckets.map(() => ({
    ingresos: 0,
    unidades: 0,
    ganancia: 0,
  }));

  const inicioMs = rango.inicio.getTime();
  const finMs = rango.fin.getTime();

  for (const v of ventasOperativas) {
    const f = new Date(v.fecha_venta);
    const ms = f.getTime();
    if (ms < inicioMs || ms > finMs) continue;

    const i = indicePorClave.get(claveBucket(f, gran));
    if (i === undefined) continue;

    const total = Number(v.total || 0);
    const costo = Number(v.precio_costo || 0);

    valores[i].ingresos += total;
    valores[i].ganancia += total - costo;
    valores[i].unidades += Number(v.cantidad || 0);
  }

  return { buckets, valores };
}

/**
 * Serie del chart del panel: representa EXACTAMENTE el período elegido en el
 * selector general (no una ventana fija de 7/30 días) más el período
 * anterior equivalente, alineado por posición dentro del período — el
 * bucket i del mes actual se compara contra el bucket i del mes anterior,
 * que es lo que hace comparable "mitad de mes contra mitad de mes".
 *
 * El eje X lo manda el período actual, recortado en `ahora`: el rango llega
 * hasta el fin del día, pero graficar las horas que todavía no pasaron
 * dibujaría una caída a cero que se lee como si hubiera dejado de vender.
 * Si el período anterior tiene menos buckets (febrero contra marzo), la
 * serie de comparación queda en null en la cola y el chart corta la línea
 * ahí en vez de dibujar ceros falsos.
 */
export function construirSerieComparada(
  ventasOperativas: Venta[],
  rangoActual: RangoFechas,
  rangoAnterior: RangoFechas,
  gran: Granularidad,
  ahora: Date,
): PuntoSerieComparada[] {
  const rangoHastaAhora: RangoFechas = {
    inicio: rangoActual.inicio,
    fin: new Date(Math.min(rangoActual.fin.getTime(), ahora.getTime())),
  };
  const actual = acumularPorBucket(ventasOperativas, rangoHastaAhora, gran);
  const anterior = acumularPorBucket(ventasOperativas, rangoAnterior, gran);

  return actual.buckets.map((bucket, i) => {
    const previo = anterior.valores[i];
    const bucketPrevio = anterior.buckets[i];

    return {
      etiqueta: etiquetaCorta(bucket, gran),
      etiquetaCompleta: etiquetaLarga(bucket, gran),
      etiquetaCompletaAnterior: bucketPrevio
        ? etiquetaLarga(bucketPrevio, gran)
        : null,
      ingresos: actual.valores[i].ingresos,
      unidades: actual.valores[i].unidades,
      ganancia: actual.valores[i].ganancia,
      ingresosAnterior: previo ? previo.ingresos : null,
      unidadesAnterior: previo ? previo.unidades : null,
      gananciaAnterior: previo ? previo.ganancia : null,
    };
  });
}
