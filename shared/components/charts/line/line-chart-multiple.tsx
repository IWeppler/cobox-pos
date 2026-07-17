import { CSSProperties } from "react";
import { scaleTime, scaleLinear, max, extent, line as d3Line, curveMonotoneX } from "d3";
import { ChartTooltipLayer, ChartHoverPoint } from "../chart-tooltip-layer";

export interface LineChartSeries {
  label: string;
  strokeClassName: string;
  dotClassName: string;
  points: { date: Date; value: number }[];
}

interface LineChartMultipleProps {
  series: LineChartSeries[];
  formatValue?: (value: number) => string;
  formatDate?: (date: Date) => string;
}

const formatValueDefault = (value: number) => value.toLocaleString("es-AR");
const formatDateDefault = (date: Date) =>
  date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

export function LineChartMultiple({
  series,
  formatValue = formatValueDefault,
  formatDate = formatDateDefault,
}: Readonly<LineChartMultipleProps>) {
  const todosLosPuntos = series.flatMap((s) => s.points);
  if (todosLosPuntos.length === 0) {
    return (
      <div className="h-72 w-full flex items-center justify-center text-sm text-muted-foreground">
        Sin datos para el rango seleccionado.
      </div>
    );
  }

  const [minDate, maxDate] = extent(todosLosPuntos, (d) => d.date) as [Date, Date];
  const xScale = scaleTime().domain([minDate, maxDate]).range([0, 100]);
  const yScale = scaleLinear()
    .domain([0, max(todosLosPuntos.map((d) => d.value)) ?? 0])
    .nice()
    .range([100, 0]);

  const lineGenerator = d3Line<{ date: Date; value: number }>()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.value))
    .curve(curveMonotoneX);

  const ejeXReferencia = series.reduce(
    (mejor, s) => (s.points.length > mejor.length ? s.points : mejor),
    [] as { date: Date; value: number }[],
  );

  const hoverPoints: ChartHoverPoint[] = series.flatMap((s) =>
    s.points.map((p, i) => ({
      id: `${s.label}-${i}`,
      leftPct: xScale(p.date),
      topPct: yScale(p.value),
      label: `${s.label} · ${formatDate(p.date)}`,
      value: formatValue(p.value),
    })),
  );

  return (
    <div
      className="relative h-72 w-full"
      style={
        {
          "--marginTop": "0px",
          "--marginRight": "8px",
          "--marginBottom": "28px",
          "--marginLeft": "48px",
        } as CSSProperties
      }
    >
      <div className="absolute inset-0 h-[calc(100%-var(--marginTop)-var(--marginBottom))] w-[var(--marginLeft)] translate-y-[var(--marginTop)] overflow-visible">
        {yScale.ticks(6).map((value, i) => (
          <div
            key={i}
            style={{ top: `${yScale(value)}%` }}
            className="absolute text-xs tabular-nums -translate-y-1/2 text-muted-foreground w-full text-right pr-2"
          >
            {formatValue(value)}
          </div>
        ))}
      </div>

      <div className="absolute inset-0 h-[calc(100%-var(--marginTop)-var(--marginBottom))] w-[calc(100%-var(--marginLeft)-var(--marginRight))] translate-x-[var(--marginLeft)] translate-y-[var(--marginTop)] overflow-visible">
        <svg viewBox="0 0 100 100" className="overflow-visible w-full h-full" preserveAspectRatio="none">
          {yScale.ticks(6).map((value, i) => (
            <g key={i} transform={`translate(0,${yScale(value)})`} className="text-border">
              <line x1={0} x2={100} stroke="currentColor" strokeDasharray="6,5" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            </g>
          ))}

          {series.map((s) => {
            const d = lineGenerator(s.points);
            if (!d) return null;
            return (
              <path
                key={s.label}
                d={d}
                fill="none"
                className={s.strokeClassName}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {series.map((s) =>
            s.points.map((p, i) => (
              <path
                key={`${s.label}-dot-${i}`}
                d={`M ${xScale(p.date)} ${yScale(p.value)} l 0.0001 0`}
                vectorEffect="non-scaling-stroke"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
                stroke="currentColor"
                className={s.dotClassName}
              />
            )),
          )}
        </svg>

        <div className="translate-y-1.5">
          {ejeXReferencia.map((p, i) => {
            const isFirst = i === 0;
            const isLast = i === ejeXReferencia.length - 1;
            if (!isFirst && !isLast && i % Math.ceil(ejeXReferencia.length / 6) !== 0) {
              return null;
            }
            return (
              <div key={i} className="overflow-visible text-muted-foreground">
                <div
                  style={{
                    left: `${xScale(p.date)}%`,
                    top: "100%",
                    transform: `translateX(${isFirst ? "0%" : isLast ? "-100%" : "-50%"})`,
                  }}
                  className="text-xs absolute whitespace-nowrap"
                >
                  {formatDate(p.date)}
                </div>
              </div>
            );
          })}
        </div>

        <ChartTooltipLayer points={hoverPoints} />
      </div>
    </div>
  );
}
