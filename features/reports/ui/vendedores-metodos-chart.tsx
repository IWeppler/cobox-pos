import { BarChartMultiVertical } from "@/shared/components/charts/bar/bar-chart-multi-vertical";
import { ChartLegend } from "@/shared/components/charts/chart-legend";
import { formatearMoneda } from "@/shared/utils/formatters";
import { colorMetodo } from "../lib/vendedores-palette";
import type {
  VendedorResumen,
  DesgloseMetodoVendedor,
} from "@/entities/reportes/types";

interface VendedoresMetodosChartProps {
  resumen: VendedorResumen[];
  desglosePorMetodo: DesgloseMetodoVendedor[];
}

const ORDEN_METODOS = [
  "EFECTIVO",
  "TARJETA",
  "BILLETERA_VIRTUAL",
  "TRANSFERENCIA",
  "CUENTA_CORRIENTE",
];

/** Desglose por método de pago, apilado por vendedor. Server Component. */
export function VendedoresMetodosChart({
  resumen,
  desglosePorMetodo,
}: Readonly<VendedoresMetodosChartProps>) {
  const metodosPresentes = Array.from(
    new Set(desglosePorMetodo.map((d) => d.metodo)),
  ).sort((a, b) => {
    const ia = ORDEN_METODOS.indexOf(a);
    const ib = ORDEN_METODOS.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const data = resumen.map((r) => ({
    key: r.nombre,
    segments: metodosPresentes.map((metodo) => ({
      label: metodo,
      value:
        desglosePorMetodo.find(
          (d) => d.vendedorId === r.vendedorId && d.metodo === metodo,
        )?.monto ?? 0,
      className: colorMetodo(metodo).fill,
    })),
  }));

  return (
    <div>
      <BarChartMultiVertical
        data={data}
        formatValue={(v) => formatearMoneda(v)}
      />
      <ChartLegend
        items={metodosPresentes.map((metodo) => ({
          label: metodo,
          colorClassName: colorMetodo(metodo).legend,
        }))}
      />
    </div>
  );
}
