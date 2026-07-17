import { BarChartVertical } from "@/shared/components/charts/bar/bar-chart-vertical";
import { ChartLegend } from "@/shared/components/charts/chart-legend";
import { formatearMoneda } from "@/shared/utils/formatters";
import { colorVendedor } from "../lib/vendedores-palette";
import type { VendedorResumen } from "@/entities/reportes/types";

interface VendedoresBarChartProps {
  resumen: VendedorResumen[];
}

/** Ranking comparativo de total vendido por vendedor. Server Component. */
export function VendedoresBarChart({
  resumen,
}: Readonly<VendedoresBarChartProps>) {
  const data = resumen.map((r, i) => ({
    key: r.nombre,
    value: r.totalVendido,
    className: colorVendedor(i).fill,
  }));

  return (
    <div>
      <BarChartVertical data={data} formatValue={(v) => formatearMoneda(v)} />
      <ChartLegend
        items={resumen.map((r, i) => ({
          label: r.nombre,
          colorClassName: colorVendedor(i).legend,
        }))}
      />
    </div>
  );
}
