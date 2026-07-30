"use client";

import { BarChart } from "@/features/reports/ui/bar-chart";
import { DonutChart } from "@/features/reports/ui/donut-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { TabsContent } from "@/shared/ui/tabs";
import {
  AlertTriangle,
  ArrowDownRight,
  CreditCard,
  Package,
  PieChart,
  Trophy,
} from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";

interface RentabilidadTabProps {
  metrics: any;
  costoMercaderiaVendida: number;
}

export function RentabilidadTab({
  metrics,
  costoMercaderiaVendida,
}: Readonly<RentabilidadTabProps>) {
  const totalBrutoCobrado = (metrics.ventasPorMetodo || []).reduce(
    (acc: number, metodo: { bruto: number }) => acc + Number(metodo.bruto || 0),
    0,
  );

  return (
    <TabsContent
      value="rentabilidad"
      className="space-y-6 outline-none animate-in fade-in-50 pt-2"
    >
      {/* ── 4 KPIs FINANCIEROS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Costo Mercadería Vendida
            </CardTitle>
            <Package className="w-4 h-4 text-accent-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              -{formatearMoneda(costoMercaderiaVendida)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Lo que te costó la mercadería
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Egresos físicos
            </CardTitle>
            <ArrowDownRight className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              -{formatearMoneda(metrics.totalEgresos)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Gastos operativos registrados
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Comisiones Digitales
            </CardTitle>
            <CreditCard className="w-4 h-4 text-accent-indigo" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              -{formatearMoneda(metrics.totalComisiones)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Retenciones MP / Tarjetas
            </p>
            {metrics.recargosCobrados > 0 ? (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-2">
                +{formatearMoneda(metrics.recargosCobrados)} recuperados por
                recargo al cliente
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ganancia Neta
            </CardTitle>
            <Trophy className="w-4 h-4 text-accent-orange" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatearMoneda(metrics.gananciaNeta)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dinero limpio a tu favor
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── GRÁFICOS DE ANÁLISIS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Columna Izquierda: Rentabilidad */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-lg">
                Rentabilidad por Categoría
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-hidden">
              <BarChart
                data={metrics.rentabilidadPorCategoria}
                color="#2f96fe"
                valuePrefix="$"
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Card className="border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-emerald-500" /> Mayor
                  Rentabilidad (Top)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {metrics.topProductosRentables.length > 0 ? (
                  <div className="divide-y divide-border">
                    {metrics.topProductosRentables
                      .slice(0, 5)
                      .map((producto: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-4 flex items-center justify-between hover:bg-muted/60 transition-colors"
                        >
                          <span className="font-medium text-sm truncate pr-2">
                            {idx + 1}. {producto.nombre}
                          </span>
                          <span className="font-semibold text-accent-blue shrink-0">
                            +{formatearMoneda(producto.ganancia)}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Sin datos.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  Menor Margen de Ganancia
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {metrics.peoresProductosRentables.length > 0 ? (
                  <div className="divide-y divide-border">
                    {metrics.peoresProductosRentables.map(
                      (producto: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-4 flex items-center justify-between hover:bg-muted/60 transition-colors"
                        >
                          <span className="text-sm text-foreground truncate pr-2">
                            {producto.nombre}
                          </span>
                          <span className="font-semibold text-destructive shrink-0">
                            +{formatearMoneda(producto.ganancia)}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Sin datos.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Columna Derecha: Composición Financiera */}
        <div className="lg:col-span-1 h-full">
          <Card className="border-border flex flex-col shadow-none h-full min-h-[480px] justify-center">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PieChart className="w-5 h-5 text-accent-indigo" />
                Composición Financiera
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex items-center justify-center py-4">
              <DonutChart
                data={metrics.donutData}
                totalIngresos={metrics.ingresos}
                margen={metrics.margenPorcentaje}
              />
            </CardContent>
          </Card>
        </div>

        {/* TABLA ANALÍTICA */}
        <Card className="lg:col-span-3 border-border shadow-none mt-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-violet-500" />
              Análisis de Cobros y Comisiones
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {metrics.ventasPorMetodo.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase font-bold tracking-widest border-b border-border/50">
                  <tr>
                    <th className="px-5 py-4">Método</th>
                    <th className="px-5 py-4 text-right">Bruto</th>
                    <th className="px-5 py-4 text-right">Costo Fin.</th>
                    <th className="px-5 py-4 text-right">Neto</th>
                    <th className="px-5 py-4 text-right">Participación (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {metrics.ventasPorMetodo.map((metodo: any, idx: number) => (
                    <tr
                      key={idx}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-2 py-4 font-semibold text-foreground">
                        {metodo.label}
                      </td>
                      <td className="px-2 py-4 text-right font-medium text-muted-foreground">
                        {formatearMoneda(metodo.bruto)}
                      </td>
                      <td className="px-2 py-4 text-right font-medium text-muted-foreground">
                        {metodo.comision > 0
                          ? `-${formatearMoneda(metodo.comision)}`
                          : "$0"}
                      </td>
                      <td className="px-2 py-4 text-right font-semibold text-muted-foreground">
                        {formatearMoneda(metodo.neto)}
                      </td>
                      <td className="px-2 py-4 text-right font-semibold text-muted-foreground">
                        {/* Participación sobre el total COBRADO por método,
                            no sobre ingresos: la tabla incluye cobros de
                            deuda, que no son ingresos del período y harían
                            pasar la suma del 100%. */}
                        {totalBrutoCobrado > 0
                          ? ((metodo.bruto / totalBrutoCobrado) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-8">
                Sin datos registrados.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
