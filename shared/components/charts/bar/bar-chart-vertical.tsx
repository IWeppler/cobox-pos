import { CSSProperties } from "react";
import { scaleBand, scaleLinear, max } from "d3";
import { ChartTooltipLayer, ChartHoverPoint } from "../chart-tooltip-layer";

export interface BarChartVerticalDatum {
  key: string;
  value: number;
  className?: string;
}

interface BarChartVerticalProps {
  data: BarChartVerticalDatum[];
  formatValue?: (value: number) => string;
  minBars?: number;
}

const formatDefault = (value: number) => value.toLocaleString("es-AR");

export function BarChartVertical({
  data,
  formatValue = formatDefault,
  minBars = 6,
}: Readonly<BarChartVerticalProps>) {
  const filledData: BarChartVerticalDatum[] = [
    ...data,
    ...Array.from({ length: Math.max(0, minBars - data.length) }, (_, i) => ({
      key: `__empty-${i}`,
      value: 0,
      className: undefined,
    })),
  ];

  const xScale = scaleBand()
    .domain(filledData.map((d) => d.key))
    .range([0, 100])
    .padding(0.3);

  const yScale = scaleLinear()
    .domain([0, max(data.map((d) => d.value)) ?? 0])
    .nice()
    .range([100, 0]);

  const hoverPoints: ChartHoverPoint[] = data.map((d) => ({
    id: d.key,
    leftPct: xScale(d.key)! + xScale.bandwidth() / 2,
    topPct: yScale(d.value),
    widthPct: xScale.bandwidth(),
    heightPct: 100 - yScale(d.value),
    label: d.key,
    value: formatValue(d.value),
  }));

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
      {/* Y axis */}
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

      {/* Chart area */}
      <div className="absolute inset-0 h-[calc(100%-var(--marginTop)-var(--marginBottom))] w-[calc(100%-var(--marginLeft)-var(--marginRight))] translate-x-[var(--marginLeft)] translate-y-[var(--marginTop)] overflow-visible">
        <svg
          viewBox="0 0 100 100"
          className="overflow-visible w-full h-full"
          preserveAspectRatio="none"
        >
          {yScale.ticks(6).map((value, i) => (
            <g
              key={i}
              transform={`translate(0,${yScale(value)})`}
              className="text-border"
            >
              <line
                x1={0}
                x2={100}
                stroke="currentColor"
                strokeDasharray="6,5"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {filledData.map((d, index) => {
            const barWidth = xScale.bandwidth();
            const barHeight = yScale(0) - yScale(d.value);

            return (
              <rect
                key={index}
                x={xScale(d.key)}
                y={yScale(d.value)}
                width={barWidth}
                height={barHeight}
                rx={1.5}
                className={d.className ?? "fill-primary/80"}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* X axis labels */}
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
