import { CSSProperties } from "react";
import { scaleBand, scaleLinear, max } from "d3";
import { ChartTooltipLayer, ChartHoverPoint } from "../chart-tooltip-layer";

export interface BarChartStackedSegment {
  label: string;
  value: number;
  className: string;
}

export interface BarChartStackedDatum {
  key: string;
  segments: BarChartStackedSegment[];
}

interface BarChartStackedVerticalProps {
  data: BarChartStackedDatum[];
  formatValue?: (value: number) => string;
}

const formatDefault = (value: number) => value.toLocaleString("es-AR");

/**
 * Barras apiladas por categoría (un vendedor = una barra, un segmento por
 * método de pago). Adaptado del template "multi-vertical" de Rosen Charts
 * — ahí las barras iban lado a lado, acá se apilan verticalmente.
 */
export function BarChartMultiVertical({
  data,
  formatValue = formatDefault,
}: Readonly<BarChartStackedVerticalProps>) {
  const totales = data.map((d) => d.segments.reduce((acc, s) => acc + s.value, 0));

  const xScale = scaleBand()
    .domain(data.map((d) => d.key))
    .range([0, 100])
    .padding(0.35);

  const yScale = scaleLinear()
    .domain([0, max(totales) ?? 0])
    .nice()
    .range([100, 0]);

  const hoverPoints: ChartHoverPoint[] = [];
  data.forEach((d) => {
    let acumulado = 0;
    d.segments.forEach((segment, segIndex) => {
      const topValor = acumulado + segment.value;
      const topPct = yScale(topValor);
      const bottomPct = yScale(acumulado);
      acumulado = topValor;

      if (segment.value <= 0) return;

      hoverPoints.push({
        id: `${d.key}-${segIndex}`,
        leftPct: xScale(d.key)! + xScale.bandwidth() / 2,
        topPct,
        widthPct: xScale.bandwidth(),
        heightPct: bottomPct - topPct,
        label: `${d.key} · ${segment.label}`,
        value: formatValue(segment.value),
      });
    });
  });

  return (
    <div
      className="relative h-72 w-full grid"
      style={
        {
          "--marginTop": "0px",
          "--marginRight": "8px",
          "--marginBottom": "40px",
          "--marginLeft": "48px",
        } as CSSProperties
      }
    >
      <div className="relative h-[calc(100%-var(--marginTop)-var(--marginBottom))] w-[var(--marginLeft)] translate-y-[var(--marginTop)] overflow-visible">
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

          {data.map((d) => {
            let acumulado = 0;
            return d.segments.map((segment, segIndex) => {
              const y0 = yScale(acumulado);
              const y1 = yScale(acumulado + segment.value);
              acumulado += segment.value;

              return (
                <rect
                  key={`${d.key}-${segIndex}`}
                  x={xScale(d.key)}
                  y={y1}
                  width={xScale.bandwidth()}
                  height={Math.max(0, y0 - y1)}
                  className={segment.className}
                  vectorEffect="non-scaling-stroke"
                />
              );
            });
          })}
        </svg>

        {data.map((entry, i) => {
          const xPosition = xScale(entry.key)! + xScale.bandwidth() / 2;
          return (
            <div
              key={i}
              className="absolute overflow-visible text-muted-foreground"
              style={{
                left: `${xPosition}%`,
                top: "100%",
                transform: "translateX(-50%) translateY(6px)",
              }}
            >
              <div className="text-xs whitespace-nowrap max-w-20 truncate">
                {entry.key}
              </div>
            </div>
          );
        })}

        <ChartTooltipLayer points={hoverPoints} />
      </div>
    </div>
  );
}
