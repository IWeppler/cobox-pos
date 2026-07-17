"use client";

import { useState } from "react";

export interface ChartHoverPoint {
  id: string;
  leftPct: number;
  topPct: number;
  /** Hit-target dimensions, en % del contenedor. */
  widthPct?: number;
  heightPct?: number;
  label: string;
  value: string;
}

interface ChartTooltipLayerProps {
  points: ChartHoverPoint[];
}

/**
 * Única pieza interactiva de los charts: overlay invisible con hit-targets
 * por punto/barra, que muestra un tooltip flotante al pasar el mouse. Todo
 * lo demás del chart (ejes, grilla, barras/lineas) se sigue renderizando
 * como Server Component — esto es lo único que necesita "use client".
 */
export function ChartTooltipLayer({ points }: Readonly<ChartTooltipLayerProps>) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = points.find((p) => p.id === hoveredId);

  return (
    <div className="absolute inset-0">
      {points.map((point) => (
        <div
          key={point.id}
          className="absolute cursor-default"
          style={{
            left: `${point.leftPct}%`,
            top: `${point.topPct}%`,
            width: `${point.widthPct ?? 4}%`,
            height: `${point.heightPct ?? 100}%`,
            transform:
              point.widthPct === undefined ? "translate(-50%, -50%)" : undefined,
          }}
          onMouseEnter={() => setHoveredId(point.id)}
          onMouseLeave={() => setHoveredId((current) => (current === point.id ? null : current))}
        />
      ))}

      {hovered && (
        <div
          className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md whitespace-nowrap"
          style={{
            left: `${hovered.leftPct}%`,
            top: `${hovered.topPct}%`,
            marginTop: "-6px",
          }}
        >
          <p className="font-semibold text-popover-foreground">{hovered.label}</p>
          <p className="text-muted-foreground">{hovered.value}</p>
        </div>
      )}
    </div>
  );
}
