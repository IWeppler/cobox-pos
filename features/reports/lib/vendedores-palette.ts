const PALETTE = [
  {
    stroke: "text-[#c5fa69]",
    dot: "text-[#c5fa69]",
    fill: "fill-[#c5fa69]",
    legend: "bg-[#c5fa69]",
  },
  {
    stroke: "text-[#d2fee3]",
    dot: "text-[#d2fee3]",
    fill: "fill-[#d2fee3]",
    legend: "bg-[#d2fee3]",
  },
  {
    stroke: "text-[#ea714f]",
    dot: "text-[#ea714f]",
    fill: "fill-[#ea714f]",
    legend: "bg-[#ea714f]",
  },
  {
    stroke: "text-[#2a80fc]",
    dot: "text-[#2a80fc]",
    fill: "fill-[#2a80fc]",
    legend: "bg-[#2a80fc]",
  },
  {
    stroke: "text-[#feb7d6]",
    dot: "text-[#feb7d6]",
    fill: "fill-[#feb7d6]",
    legend: "bg-[#feb7d6]",
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
  EFECTIVO: "fill-[#c5fa69]",
  TARJETA: "fill-[#d2fee3]",
  TRANSFERENCIA: "fill-[#2a80fc]",
  CUENTA_CORRIENTE: "fill-[#ea714f]",
  BILLETERA_VIRTUAL: "fill-[#c5fa69]",
};

const METODO_LEGEND: Record<string, string> = {
  EFECTIVO: "bg-[#c5fa69]",
  TARJETA: "bg-[#d2fee3]",
  TRANSFERENCIA: "bg-[#2a80fc]",
  CUENTA_CORRIENTE: "bg-[#ea714f]",
  BILLETERA_VIRTUAL: "bg-[#c5fa69]",
};

export function colorMetodo(metodo: string) {
  return {
    fill: METODO_COLOR[metodo] ?? "fill-muted-foreground/60",
    legend: METODO_LEGEND[metodo] ?? "bg-muted-foreground",
  };
}
