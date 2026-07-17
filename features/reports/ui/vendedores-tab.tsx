"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { TabsContent } from "@/shared/ui/tabs";
import { getReporteVendedoresAction } from "../actions/get-reporte-vendedores";
import { VendedoresTablaResumen } from "./vendedores-tabla-resumen";
import { VendedoresBarChart } from "./vendedores-bar-chart";
import { VendedoresLineChart } from "./vendedores-line-chart";
import { VendedoresMetodosChart } from "./vendedores-metodos-chart";
import { VendedorDetallePanel } from "./vendedor-detalle-panel";
import type { ReporteVendedoresData } from "@/entities/reportes/types";

interface VendedoresTabProps {
  puedeVer: boolean;
  desde: string;
  hasta: string;
}

export function VendedoresTab({ puedeVer, desde, hasta }: Readonly<VendedoresTabProps>) {
  const [data, setData] = useState<ReporteVendedoresData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);

  useEffect(() => {
    if (!puedeVer) return;

    let cancelado = false;

    const cargarReporte = async () => {
      setIsLoading(true);
      setError(null);

      const res = await getReporteVendedoresAction(desde, hasta);
      if (cancelado) return;
      setIsLoading(false);
      if (res.error) {
        setError(res.error);
        setData(null);
      } else {
        setData(res.data);
        setSeleccionadoId(null);
      }
    };

    cargarReporte();

    return () => {
      cancelado = true;
    };
  }, [puedeVer, desde, hasta]);

  if (!puedeVer) return null;

  const vendedorSeleccionado = data?.resumen.find(
    (r) => r.vendedorId === seleccionadoId,
  );

  return (
    <TabsContent value="vendedores" className="space-y-6 mt-0">
      {isLoading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando reporte...
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 flex items-center gap-2 text-sm">
          <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          <VendedoresTablaResumen
            resumen={data.resumen}
            seleccionadoId={seleccionadoId}
            onSeleccionar={(id) =>
              setSeleccionadoId((current) => (current === id ? null : id))
            }
          />

          {vendedorSeleccionado && (
            <VendedorDetallePanel
              vendedor={vendedorSeleccionado}
              detalle={
                data.porVendedor[vendedorSeleccionado.vendedorId] ?? {
                  topProductos: [],
                  anuladas: [],
                }
              }
              onClose={() => setSeleccionadoId(null)}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Ranking por total vendido
              </h3>
              <VendedoresBarChart resumen={data.resumen} />
            </div>

            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Desglose por método de pago
              </h3>
              <VendedoresMetodosChart
                resumen={data.resumen}
                desglosePorMetodo={data.desglosePorMetodo}
              />
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Ventas por día
            </h3>
            <VendedoresLineChart
              resumen={data.resumen}
              ventasPorDia={data.ventasPorDia}
            />
          </div>
        </>
      )}
    </TabsContent>
  );
}
