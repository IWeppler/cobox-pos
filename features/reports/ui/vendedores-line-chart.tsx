import { LineChartMultiple } from "@/shared/components/charts/line/line-chart-multiple";
import { ChartLegend } from "@/shared/components/charts/chart-legend";
import { formatearMoneda } from "@/shared/utils/formatters";
import { colorVendedor } from "../lib/vendedores-palette";
import type {
  VendedorResumen,
  VentaPorDiaVendedor,
} from "@/entities/reportes/types";

interface VendedoresLineChartProps {
  resumen: VendedorResumen[];
  ventasPorDia: VentaPorDiaVendedor[];
}

/** Ventas por día, una serie por vendedor. Server Component. */
export function VendedoresLineChart({
  resumen,
  ventasPorDia,
}: Readonly<VendedoresLineChartProps>) {
  const series = resumen.map((r, i) => {
    const color = colorVendedor(i);
    const puntos = ventasPorDia
      .filter((v) => v.vendedorId === r.vendedorId)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((v) => ({ date: new Date(`${v.fecha}T00:00:00`), value: v.total }));

    return {
      label: r.nombre,
      strokeClassName: color.stroke,
      dotClassName: color.dot,
      points: puntos,
    };
  });

  return (
    <div>
      <LineChartMultiple
        series={series}
        formatValue={(v) => formatearMoneda(v)}
      />
      <ChartLegend
        items={resumen.map((r, i) => ({
          label: r.nombre,
          colorClassName: colorVendedor(i).legend,
        }))}
      />
    </div>
  );
}
