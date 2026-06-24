"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { TabsContent } from "@/shared/ui/tabs";
import {
  AlertTriangle,
  Flame,
  Package,
  Tags,
  Clock,
  TrendingUp,
} from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";

interface InventarioTabProps {
  metrics: any;
}

export function InventarioTab({ metrics }: Readonly<InventarioTabProps>) {
  // Estado para controlar la ventana de "Stock sin movimiento"
  const [filtroDias, setFiltroDias] = useState<number>(30);

  // Filtramos la lista basándonos en la selección
  const productosSinMov = (metrics.productosSinMovimiento || [])
    .filter((p: any) => p.diasSinVender >= filtroDias)
    .sort((a: any, b: any) => b.diasSinVender - a.diasSinVender);

  return (
    <TabsContent
      value="inventario"
      className="space-y-6 outline-none animate-in fade-in-50 pt-2"
    >
      {/* SECCIÓN SUPERIOR DE KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Capital Inmovilizado Analítico (Ocupa 2/3 de la pantalla) */}
        <Card className="border-border shadow-none lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/40">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              Capital en Inventario
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Costo */}
              <div className="bg-card p-4 rounded-xl border border-border/50 flex flex-col justify-center">
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">
                  Valor al Costo
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {formatearMoneda(metrics.stockValorizadoCosto)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Capital inmovilizado
                </p>
              </div>

              {/* Potencial Venta */}
              <div className="bg-card p-4 rounded-xl border border-border/50 flex flex-col justify-center">
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">
                  Valor Venta (Potencial)
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {formatearMoneda(metrics.stockValorizadoPotencial)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Si vendes el 100% del stock
                </p>
              </div>

              {/* Ganancia Potencial */}
              <div className="bg-card p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/50 flex flex-col justify-center">
                <p className="text-xs text-emerald-800 dark:text-emerald-400 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                  Ganancia Potencial
                </p>
                <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-500">
                  +{formatearMoneda(metrics.stockGananciaPotencial)}
                </p>
                <p className="text-xs text-emerald-700/70 dark:text-emerald-500/70 font-medium mt-1">
                  Rentabilidad estipulada
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Columna Derecha (Stock Total + Alertas) */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card className="border-border shadow-none flex-1 flex flex-col justify-center">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground">
                Stock Físico
              </CardTitle>
              <Tags className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {metrics.stockTotalUnidades}{" "}
                <span className="text-sm font-medium text-muted-foreground">
                  unidades
                </span>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`shadow-none flex-1 flex flex-col justify-center ${metrics.productosCriticos > 0 ? "border-rose-200 bg-rose-50 dark:bg-destructive/10" : "border-border"}`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle
                className={`text-sm font-bold ${metrics.productosCriticos > 0 ? "text-rose-800 dark:text-destructive" : "text-muted-foreground"}`}
              >
                Alertas de Stock
              </CardTitle>
              <AlertTriangle
                className={`w-4 h-4 ${metrics.productosCriticos > 0 ? "text-rose-600 dark:text-destructive" : "text-muted-foreground"}`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${metrics.productosCriticos > 0 ? "text-rose-700 dark:text-destructive" : "text-foreground"}`}
              >
                {metrics.productosCriticos}
              </div>
              <p
                className={`text-xs mt-1 ${metrics.productosCriticos > 0 ? "text-rose-600 font-medium dark:text-destructive" : "text-muted-foreground"}`}
              >
                Productos en nivel crítico
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ======================= */}
      {/* SECCIÓN DE LISTAS */}
      {/* ======================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TOP ROTACIÓN */}
        <Card className="border-border shadow-none flex flex-col">
          <CardHeader className="border-b border-border/40 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" /> Mayor Rotación
              (Unidades)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {metrics.topProductos.length > 0 ? (
              <div className="divide-y divide-border/60">
                {metrics.topProductos
                  .slice(0, 5)
                  .map((producto: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors"
                    >
                      <span className="font-semibold text-sm text-foreground flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </div>
                        <span className="truncate max-w-[200px] sm:max-w-xs">
                          {producto.nombre}
                        </span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {producto.unidades} u.
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-12 text-center text-sm text-muted-foreground h-full flex items-center justify-center">
                Aún no hay datos de ventas.
              </div>
            )}
          </CardContent>
        </Card>

        {/* PRODUCTOS SIN MOVIMIENTO (Módulo Interactivo) */}
        <Card className="border-border shadow-none flex flex-col">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 gap-4 border-b border-border/40">
            <CardTitle className="text-lg flex items-center gap-2 text-slate-600 dark:text-slate-300 shrink-0">
              <Clock className="w-5 h-5 text-blue-500" /> Stock sin movimiento
            </CardTitle>

            {/* SELECTOR DE VENTANA DE TIEMPO */}
            <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50 shrink-0 w-full sm:w-auto overflow-x-auto">
              {[30, 60, 90].map((dias) => (
                <button
                  key={dias}
                  onClick={() => setFiltroDias(dias)}
                  className={`flex-1 sm:flex-none text-xs font-bold px-3 py-1.5 rounded-md transition-all ${
                    filtroDias === dias
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  +{dias} días
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1">
            {productosSinMov.length > 0 ? (
              <ScrollArea className="h-[280px]">
                <div className="divide-y divide-border/60">
                  {productosSinMov.map((producto: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 px-4 flex items-center justify-between hover:bg-muted/40 transition-colors"
                    >
                      <span className="font-medium text-sm text-foreground truncate max-w-[200px] sm:max-w-xs pr-2">
                        {producto.nombre}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold text-rose-600 bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900 shrink-0 shadow-none uppercase tracking-wider"
                      >
                        {producto.diasSinVender === 9999
                          ? "Nunca se vendió"
                          : `Hace ${producto.diasSinVender} días`}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center text-sm text-muted-foreground h-full min-h-[280px]">
                <TrendingUp className="w-8 h-8 text-emerald-500 mb-3 opacity-50" />
                <p className="font-semibold text-foreground text-base">
                  ¡Excelente rotación!
                </p>
                <p className="mt-1">
                  No tienes productos estancados hace más de {filtroDias} días.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ======================= */}
      {/* ALERTA STOCK CRÍTICO */}
      {/* ======================= */}
      <Card className="border-border shadow-none">
        <CardHeader className="bg-muted/20 border-b border-border py-4">
          <CardTitle className="text-base text-rose-800 dark:text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Stock Crítico Detallado (≤ 3
            unidades)
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase font-bold tracking-widest">
              <tr>
                <th className="px-5 py-3 border-b border-border/50">
                  Producto
                </th>
                <th className="px-5 py-3 border-b border-border/50">
                  Talle / Variante
                </th>
                <th className="px-5 py-3 text-right border-b border-border/50">
                  Cant. Actual
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {metrics.stockCriticoDetallado.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-10 text-center text-muted-foreground font-medium"
                  >
                    Tu inventario está sano. No hay productos críticos.
                  </td>
                </tr>
              ) : (
                metrics.stockCriticoDetallado.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-card transition-colors">
                    <td className="px-5 py-3 font-semibold text-foreground">
                      {item.nombre}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs font-medium">
                      {item.variante}
                    </td>
                    <td className="px-5 py-3 text-right font-black text-rose-600 dark:text-rose-500">
                      {item.cantidad} u.
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </TabsContent>
  );
}
