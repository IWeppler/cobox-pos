export interface ChartLegendItem {
  label: string;
  colorClassName: string;
}

/** Leyenda simple para charts con 2+ series — nunca color solo, siempre con texto. */
export function ChartLegend({ items }: Readonly<{ items: ChartLegendItem[] }>) {
  if (items.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center pt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${item.colorClassName}`} />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
