import { Venta } from "@/entities/ventas/types";
import type { RangoFechas } from "@/shared/lib/periodo-ranges";

export type Granularidad = "hora" | "dia" | "mes";

export type MetricaSerie = "ingresos" | "unidades" | "ganancia";

export type PuntoSerie = {
  /** Etiqueta corta del eje X. */
  etiqueta: string;
  /** Etiqueta larga para el tooltip. */
  etiquetaCompleta: string;
  ingresos: number;
  unidades: number;
  ganancia: number;
};

/** Punto del chart del panel: el día, más su media móvil y si es el día en
 * curso. Las medias son null donde no se pueden calcular honestamente (ver
 * `agregarMediaMovil`). */
export type PuntoSerieChart = PuntoSerie & {
  /** El último día de la ventana, que todavía no terminó. */
  esHoy: boolean;
  ingresosMedia: number | null;
  unidadesMedia: number | null;
  gananciaMedia: number | null;
};

/** Días de la media móvil. 7 y no otro número: alisa exactamente un ciclo
 * semanal completo, que es el que domina estos negocios (sábado 17,67 ventas
 * por día contra 3,75 el lunes, medido en Evens sobre 60 días). */
export const VENTANA_MEDIA_MOVIL = 7;

/**
 * Agrega la media móvil de `ventana` días a una serie diaria.
 *
 * Dos huecos deliberados, los dos por el mismo motivo — una media sobre una
 * ventana incompleta no es una media más baja, es un número que no
 * corresponde, y dibujado se lee como una caída del negocio:
 *
 * 1. Los primeros `ventana - 1` puntos no tienen 7 días atrás. La línea
 *    arranca en el día 7 y las barras ocupan la ventana entera; el hueco
 *    inicial es honesto y no se lee mal.
 * 2. El ÚLTIMO punto es el día en curso, que tiene horas de menos. Incluirlo
 *    haría caer la línea todas las mañanas. La media termina ayer, que es el
 *    último día completo, y hoy queda solo como barra (marcada aparte).
 */
export function agregarMediaMovil(
  serie: PuntoSerie[],
  ventana: number = VENTANA_MEDIA_MOVIL,
): PuntoSerieChart[] {
  const ultimo = serie.length - 1;

  return serie.map((punto, i) => {
    const esHoy = i === ultimo;
    const hayVentanaCompleta = i >= ventana - 1 && !esHoy;

    if (!hayVentanaCompleta) {
      return {
        ...punto,
        esHoy,
        ingresosMedia: null,
        unidadesMedia: null,
        gananciaMedia: null,
      };
    }

    const tramo = serie.slice(i - ventana + 1, i + 1);
    const promedio = (clave: "ingresos" | "unidades" | "ganancia") =>
      tramo.reduce((acc, p) => acc + p[clave], 0) / ventana;

    return {
      ...punto,
      esHoy,
      ingresosMedia: promedio("ingresos"),
      unidadesMedia: promedio("unidades"),
      gananciaMedia: promedio("ganancia"),
    };
  });
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
 * Acumula ventas por bucket dentro de un rango. Las ventas fuera del rango se
 * descartan aunque caigan en un bucket que el rango toca parcialmente (un
 * rango que arranca a mitad de mes con granularidad "mes" no se lleva las
 * ventas de la primera quincena).
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
 * Serie del chart del panel: un punto por bucket del rango que le pasen (hoy,
 * la ventana móvil de 4 semanas).
 *
 * El eje X va recortado en `ahora`: el rango llega hasta el fin del día, pero
 * graficar las horas que todavía no pasaron dibujaría una caída a cero que se
 * lee como si hubiera dejado de vender.
 *
 * Acá vivía también la serie del período anterior, que el chart dibujaba como
 * línea punteada. Se sacó junto con el dibujo: comparar día contra día con ~8
 * ventas diarias es ruido contra ruido, y el veredicto contra el período
 * anterior ya lo dan los badges de las KPIs con el número exacto.
 */
export function construirSerie(
  ventasOperativas: Venta[],
  rango: RangoFechas,
  gran: Granularidad,
  ahora: Date,
): PuntoSerie[] {
  const rangoHastaAhora: RangoFechas = {
    inicio: rango.inicio,
    fin: new Date(Math.min(rango.fin.getTime(), ahora.getTime())),
  };
  const { buckets, valores } = acumularPorBucket(
    ventasOperativas,
    rangoHastaAhora,
    gran,
  );

  return buckets.map((bucket, i) => ({
    etiqueta: etiquetaCorta(bucket, gran),
    etiquetaCompleta: etiquetaLarga(bucket, gran),
    ingresos: valores[i].ingresos,
    unidades: valores[i].unidades,
    ganancia: valores[i].ganancia,
  }));
}
