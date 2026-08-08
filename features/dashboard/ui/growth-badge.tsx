import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface GrowthBadgeProps {
  /** null = el período anterior no tuvo datos: no hay variación calculable. */
  value: number | null;
  /** "vs. mes anterior" — se muestra como title, para que el % se entienda
   * contra qué se mide sin agrandar la card. */
  titulo?: string;
}

export function GrowthBadge({ value, titulo }: Readonly<GrowthBadgeProps>) {
  // Sin período anterior no se inventa un +0% verde (se leería como "igual
  // que antes" cuando en realidad no hay con qué comparar).
  if (value === null) {
    return (
      <span
        title="Sin datos en el período anterior"
        className="inline-flex shrink-0 items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
      >
        s/d
      </span>
    );
  }

  const isPositive = value >= 0;
  return (
    <span
      title={titulo}
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
        isPositive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      {isPositive ? "+" : ""}
      {value.toFixed(0)}%
    </span>
  );
}
