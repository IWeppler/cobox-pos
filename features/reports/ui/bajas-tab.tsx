import { Producto } from "@/entities/productos/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { TabsContent } from "@/shared/ui/tabs";
import { AlertTriangle, DropletOff, Percent } from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";
import {
  BajaAprobadaReporte,
  ReportesMetrics,
} from "@/entities/reportes/types";

interface BajasTabProps {
  metrics: ReportesMetrics;
  bajasDelPeriodo: BajaAprobadaReporte[];
  productos: Producto[];
}

export function BajasTab({
  metrics,
  bajasDelPeriodo,
  productos,
}: Readonly<BajasTabProps>) {
  // KPI Crucial: % de Fuga de Capital (Costo Mermas / Ingresos Brutos)
  const ratioMermas =
    metrics.ingresos > 0
      ? (metrics.costoPerdidoBajas / metrics.ingresos) * 100
      : 0;

  return (
    <TabsContent
      value="bajas"
      className="space-y-6 outline-none animate-in fade-in-50 pt-2"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Perdida Total por Bajas
            </CardTitle>
            <DropletOff className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {formatearMoneda(metrics.costoPerdidoBajas)}
            </div>
            <p className="text-xs mt-1 font-medium">
              Dinero perdido en bajas aprobadas
            </p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Volumen Afectado
            </CardTitle>
            <AlertTriangle className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {metrics.unidadesBajas}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                unidades rotas/perdidas
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-none flex flex-col justify-center">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impacto sobre Ingresos
            </CardTitle>
            <Percent className="w-4 h-4 text-danger" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-bold text-foreground">
                {ratioMermas.toFixed(1)}%
              </span>
              <span className="text-xs font-semibold text-danger mb-1">
                Fuga
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-danger h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(ratioMermas, 100)}%`, // Topamos al 100% por seguridad visual
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GRÁFICO DE BARRAS: Bajas por Motivo */}
        <Card className="lg:col-span-1 border-border flex flex-col shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Fugas por Motivo</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {metrics.bajasPorMotivo.length > 0 ? (
              <div className="space-y-4">
                {metrics.bajasPorMotivo.map((motivo, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-foreground">
                        {motivo.label}
                      </span>
                      <span className="font-bold text-warning">
                        {formatearMoneda(motivo.value)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-amber-400 h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(motivo.value / metrics.costoPerdidoBajas) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-sm py-8">
                Sin bajas registradas.
              </div>
            )}
          </CardContent>
        </Card>

        {/* TABLA: Historial de Bajas */}
        <Card className="lg:col-span-2 border-border overflow-hidden shadow-none">
          <CardHeader className="bg-muted/20 border-b border-border py-4">
            <CardTitle className="text-base">
              Historial de Mermas ({bajasDelPeriodo.length})
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-bold tracking-widest border-b border-border">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Producto / Variante</th>
                  <th className="px-5 py-3 hidden sm:table-cell">Motivo</th>
                  <th className="px-5 py-3 text-right">Costo Fuga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {bajasDelPeriodo.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-12 text-center text-muted-foreground font-medium"
                    >
                      No hay bajas aprobadas en este período. ¡Excelente!
                    </td>
                  </tr>
                ) : (
                  bajasDelPeriodo.map((baja) => {
                    const prodAsociado = productos.find(
                      (p) => p.id === baja.producto_id,
                    );
                    const costoUnitario = Number(
                      prodAsociado?.precio_costo || 0,
                    );
                    const cantidadBaja = Number(baja.cantidad || 0);
                    const costoFuga = costoUnitario * cantidadBaja;

                    return (
                      <tr
                        key={baja.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap text-xs">
                          {new Date(baja.creado_en).toLocaleDateString("es-AR")}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-foreground">
                          {prodAsociado?.nombre || "Producto eliminado"}
                          <span className="text-muted-foreground ml-1 font-normal text-xs">
                            ({baja.variante}) x{baja.cantidad}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs hidden sm:table-cell">
                          {baja.motivo}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-warning text-right">
                          -{formatearMoneda(costoFuga)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </TabsContent>
  );
}
