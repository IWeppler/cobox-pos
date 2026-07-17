const PALETTE = [
  {
    stroke: "text-accent-blue",
    dot: "text-accent-blue",
    fill: "fill-accent-blue",
    legend: "bg-accent-blue",
  },
  {
    stroke: "text-accent-orange",
    dot: "text-accent-orange",
    fill: "fill-accent-orange",
    legend: "bg-accent-orange",
  },
  {
    stroke: "text-emerald-700 dark:text-accent-lime",
    dot: "text-emerald-700 dark:text-accent-lime",
    fill: "fill-emerald-700 dark:fill-accent-lime",
    legend: "bg-emerald-700 dark:bg-accent-lime",
  },
  {
    stroke: "text-amber-500",
    dot: "text-amber-600",
    fill: "fill-amber-500",
    legend: "bg-amber-500",
  },
  {
    stroke: "text-teal-500",
    dot: "text-teal-600",
    fill: "fill-teal-500/80",
    legend: "bg-teal-500",
  },
  {
    stroke: "text-orange-500",
    dot: "text-orange-600",
    fill: "fill-orange-500/80",
    legend: "bg-orange-500",
  },
  {
    stroke: "text-violet-500",
    dot: "text-violet-600",
    fill: "fill-violet-500/80",
    legend: "bg-violet-500",
  },
  {
    stroke: "text-red-500",
    dot: "text-red-600",
    fill: "fill-red-500/80",
    legend: "bg-red-500",
  },
] as const;

export function colorVendedor(index: number) {
  return PALETTE[index] ?? PALETTE[PALETTE.length - 1];
}

const METODO_COLOR: Record<string, string> = {
  EFECTIVO: "fill-[#c7ea46]",
  TARJETA: "fill-[#f97d47]",
  TRANSFERENCIA: "fill-[#a8a1f2]",
  CUENTA_CORRIENTE: "fill-[#ffc107]",
  BILLETERA_VIRTUAL: "fill-[#2f96fe]",
};

const METODO_LEGEND: Record<string, string> = {
  EFECTIVO: "bg-[#c7ea46]",
  TARJETA: "bg-[#f97d47]",
  TRANSFERENCIA: "bg-[#a8a1f2]",
  CUENTA_CORRIENTE: "bg-[#ffc107]",
  BILLETERA_VIRTUAL: "bg-[#2f96fe]",
};

export function colorMetodo(metodo: string) {
  return {
    fill: METODO_COLOR[metodo] ?? "fill-muted-foreground/60",
    legend: METODO_LEGEND[metodo] ?? "bg-muted-foreground",
  };
}
