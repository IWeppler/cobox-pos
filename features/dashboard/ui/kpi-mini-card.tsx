import type { ReactNode } from "react";

interface KpiMiniCardProps {
  label: string;
  value: string;
  sublabel: string;
  rightSlot?: ReactNode;
}

/** Card compacta para la grilla 2x2 de KPIs — v2 del panel: nada de tamaño
 * "héroe" acá (eso quedó en v1 y generaba scroll), valores en un escalón
 * más chico para no cortar en la columna angosta (40% del ancho). */
export function KpiMiniCard({
  label,
  value,
  sublabel,
  rightSlot,
}: Readonly<KpiMiniCardProps>) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 flex flex-col justify-between gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </span>
        {rightSlot}
      </div>
      <p className="font-mono text-lg sm:text-xl font-semibold text-foreground truncate">
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground truncate">{sublabel}</p>
    </div>
  );
}
