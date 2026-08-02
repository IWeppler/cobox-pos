import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function GrowthBadge({ value }: Readonly<{ value: number }>) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
        isPositive
          ? "bg-success/10 text-success"
          : "bg-danger/10 text-danger"
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
