"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PuntoSerieDiaria } from "../lib/build-chart-series";
import { formatearMoneda } from "@/shared/utils/formatters";

type MetricaChart = "ingresos" | "unidades" | "ganancia";
type RangoChart = 7 | 30;

const TABS: { value: MetricaChart; label: string }[] = [
  { value: "ingresos", label: "Facturación" },
  { value: "unidades", label: "Unidades" },
  { value: "ganancia", label: "Ganancia" },
];

const RANGOS: { value: RangoChart; label: string }[] = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
];

const COLOR_POR_METRICA: Record<MetricaChart, string> = {
  ingresos: "var(--color-primary, #6366f1)",
  unidades: "#0ea5e9",
  ganancia: "#10b981",
};

const compactFormatter = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatearValorEje(metrica: MetricaChart, value: number): string {
  if (metrica === "unidades") return compactFormatter.format(value);
  return `$${compactFormatter.format(value)}`;
}

function formatearValorTooltip(metrica: MetricaChart, value: number): string {
  if (metrica === "unidades") return `${value} u.`;
  return formatearMoneda(value);
}

function formatearFechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

interface IngresosAreaChartProps {
  serie: PuntoSerieDiaria[];
}

/** Area chart con degradé (estilo Vercel/Stripe) — ventana fija (la que
 * venga en `serie`, 14-30 días), independiente del selector de período del
 * panel. Tabs cambian qué métrica se grafica. */
export function IngresosAreaChart({ serie }: Readonly<IngresosAreaChartProps>) {
  const [metrica, setMetrica] = useState<MetricaChart>("ingresos");
  const [rango, setRango] = useState<RangoChart>(30);

  const gradientId = `gradiente-${metrica}`;
  const color = COLOR_POR_METRICA[metrica];

  // `serie` viene fija en 30 días desde el server (construirSerieDiaria) —
  // 7D es un slice client-side de esos mismos datos, sin refetch.
  const serieVisible = useMemo(
    () => (rango === 7 ? serie.slice(-7) : serie),
    [serie, rango],
  );

  const data = useMemo(
    () => serieVisible.map((p) => ({ fecha: p.fecha, valor: p[metrica] })),
    [serieVisible, metrica],
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tendencia
        </span>
        <div className="flex items-center gap-2 flex-wrap">
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
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
            {RANGOS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRango(r.value)}
                className={`h-7 rounded-md px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                  rango === r.value
                    ? "bg-card text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="fecha"
              tickFormatter={formatearFechaCorta}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) => formatearValorEje(metrica, v)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              formatter={(value) => [
                formatearValorTooltip(metrica, Number(value)),
                TABS.find((t) => t.value === metrica)?.label ?? "",
              ]}
              labelFormatter={(label) => formatearFechaCorta(String(label))}
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
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
