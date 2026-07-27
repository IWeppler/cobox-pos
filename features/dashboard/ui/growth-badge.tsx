import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function GrowthBadge({ value }: Readonly<{ value: number }>) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
        isPositive
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
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
