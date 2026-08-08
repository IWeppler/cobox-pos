"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  MetricaSerie,
  PuntoSerieComparada,
} from "../lib/build-chart-series";
import { formatearMoneda } from "@/shared/utils/formatters";
import { MEDIA_MOBILE, useMediaQuery } from "@/shared/lib/use-media-query";

const TABS: { value: MetricaSerie; label: string }[] = [
  { value: "ingresos", label: "Facturación" },
  { value: "unidades", label: "Unidades" },
  { value: "ganancia", label: "Ganancia" },
];

const COLOR_POR_METRICA: Record<MetricaSerie, string> = {
  ingresos: "var(--color-primary, #6366f1)",
  unidades: "#0ea5e9",
  ganancia: "#10b981",
};

const COLOR_ANTERIOR = "var(--muted-foreground, #9ca3af)";

const compactFormatter = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatearValorEje(metrica: MetricaSerie, value: number): string {
  if (metrica === "unidades") return compactFormatter.format(value);
  return `$${compactFormatter.format(value)}`;
}

function formatearValorTooltip(metrica: MetricaSerie, value: number): string {
  if (metrica === "unidades") return `${value} u.`;
  return formatearMoneda(value);
}

interface IngresosAreaChartProps {
  serie: PuntoSerieComparada[];
  /** "esta semana", "este mes"… — de dónde salen los datos de la serie sólida. */
  etiquetaPeriodo: string;
  /** "semana anterior", "mes anterior"… — la serie punteada. */
  etiquetaPeriodoAnterior: string;
}

/**
 * Area chart del panel. NO tiene selector propio de rango: grafica
 * exactamente el período del selector general del dashboard (la serie ya
 * viene resuelta desde el server con esos rangos). Las tabs cambian qué
 * métrica se grafica, no el recorte temporal.
 *
 * Dos series: área sólida = período actual, línea punteada = mismo tramo del
 * período anterior equivalente.
 *
 * En mobile el eje Y se oculta y el área del gráfico se estira contra los
 * bordes de la card: el valor exacto se consulta tocando o deslizando el
 * dedo sobre el gráfico (tooltip). En desktop el eje Y queda como estaba.
 */
export function IngresosAreaChart({
  serie,
  etiquetaPeriodo,
  etiquetaPeriodoAnterior,
}: Readonly<IngresosAreaChartProps>) {
  const [metrica, setMetrica] = useState<MetricaSerie>("ingresos");
  // En mobile el eje Y se come ~56px de un ancho de 320 y deja el área del
  // gráfico demasiado angosta para el dedo: se saca el eje y el valor exacto
  // se consulta con el tooltip (touch/drag). En desktop sigue igual.
  const esMobile = useMediaQuery(MEDIA_MOBILE);

  const gradientId = `gradiente-${metrica}`;
  const color = COLOR_POR_METRICA[metrica];
  const claveAnterior = `${metrica}Anterior` as const;

  const data = useMemo(
    () =>
      serie.map((p) => ({
        etiqueta: p.etiqueta,
        etiquetaCompleta: p.etiquetaCompleta,
        etiquetaCompletaAnterior: p.etiquetaCompletaAnterior,
        valor: p[metrica],
        valorAnterior: p[claveAnterior],
      })),
    [serie, metrica, claveAnterior],
  );

  const hayComparacion = data.some((p) => p.valorAnterior !== null);

  // Densidad del eje X según período y pantalla: 31 días o 24 horas de
  // etiquetas se enciman. `interval` es cuántos ticks saltear entre uno y
  // otro, de ahí el -1. En mobile entran ~4 etiquetas, en desktop ~8.
  const intervaloTicks = Math.max(
    0,
    Math.ceil(data.length / (esMobile ? 4 : 8)) - 1,
  );

  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-4 flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tendencia
          </span>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ background: color }}
              />
              {etiquetaPeriodo}
            </span>
            {hayComparacion && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-0 w-3 border-t border-dashed"
                  style={{ borderColor: COLOR_ANTERIOR }}
                />
                {etiquetaPeriodoAnterior}
              </span>
            )}
          </div>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setMetrica(tab.value)}
              className={`h-7 rounded-md px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                metrica === tab.value
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* touch-action pan-y: el deslizamiento vertical sigue scrolleando la
          página, el horizontal se lo queda el chart para mover el tooltip. */}
      <div
        className="h-[240px] sm:h-[260px] w-[calc(100%+1rem)] -mx-2 sm:w-full sm:mx-0"
        style={{ touchAction: "pan-y" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={
              esMobile
                ? { top: 8, right: 4, left: 4, bottom: 0 }
                : { top: 8, right: 8, left: 0, bottom: 0 }
            }
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="etiqueta"
              tick={{ fontSize: esMobile ? 10 : 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval={intervaloTicks}
              minTickGap={esMobile ? 8 : 24}
              tickMargin={4}
            />
            {/* En mobile va `hide` y no desmontado: el eje sigue definiendo la
                escala, pero no dibuja nada ni reserva ancho. El valor exacto
                se lee en el tooltip. */}
            <YAxis
              hide={esMobile}
              tickFormatter={(v) => formatearValorEje(metrica, v)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              formatter={(value, name, item) => {
                const punto = item?.payload as
                  | { etiquetaCompleta: string; etiquetaCompletaAnterior: string | null }
                  | undefined;
                const esAnterior = name === "valorAnterior";
                const fecha = esAnterior
                  ? punto?.etiquetaCompletaAnterior
                  : punto?.etiquetaCompleta;
                const periodo = esAnterior
                  ? etiquetaPeriodoAnterior
                  : etiquetaPeriodo;
                return [
                  formatearValorTooltip(metrica, Number(value)),
                  fecha ? `${periodo} (${fecha})` : periodo,
                ];
              }}
              labelFormatter={() => ""}
              // Línea vertical bajo el dedo: sin eje Y en mobile es la única
              // referencia de qué punto se está leyendo.
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              offset={16}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="valor"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              // Punto activo grande: en mobile es el feedback de dónde cayó
              // el dedo.
              activeDot={{ r: esMobile ? 5 : 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            {hayComparacion && (
              <Line
                type="monotone"
                dataKey="valorAnterior"
                stroke={COLOR_ANTERIOR}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                // Sin conectar nulls: si el período anterior es más corto,
                // la línea corta ahí en vez de inventar continuidad.
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
