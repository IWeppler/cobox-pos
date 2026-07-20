"use client";

import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Search } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type { MovimientoStock } from "../actions/get-movimientos-stock";

type FiltroTipo = "TODOS" | "INGRESO" | "EGRESO";

type MovimientosTableProps = {
  movimientos: MovimientoStock[];
};

export function MovimientosTable({ movimientos }: MovimientosTableProps) {
  const [tipo, setTipo] = useState<FiltroTipo>("TODOS");
  const [busqueda, setBusqueda] = useState("");

  const totales = useMemo(
    () => ({
      todos: movimientos.length,
      ingresos: movimientos.filter((m) => m.tipo === "INGRESO").length,
      egresos: movimientos.filter((m) => m.tipo === "EGRESO").length,
    }),
    [movimientos],
  );

  const filtrados = useMemo(() => {
    const query = busqueda.trim().toLowerCase();
    return movimientos.filter((m) => {
      if (tipo !== "TODOS" && m.tipo !== tipo) return false;
      if (query && !m.producto.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [movimientos, tipo, busqueda]);

  const formatearFecha = (fecha: string) =>
    new Date(fecha).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between bg-card p-2 sm:p-3 rounded-xl border border-border">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            className="pl-9 h-10 text-sm rounded-lg border-border bg-muted w-full"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="flex gap-2 shrink-0 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { value: "TODOS", label: "Todos", count: totales.todos },
              {
                value: "INGRESO",
                label: "Ingresos",
                count: totales.ingresos,
              },
              { value: "EGRESO", label: "Egresos", count: totales.egresos },
            ] as const
          ).map((opcion) => (
            <Button
              key={opcion.value}
              variant={tipo === opcion.value ? "default" : "outline"}
              className={`rounded-full h-9 px-4 text-xs font-semibold shrink-0 shadow-none border-border/60 ${
                tipo === opcion.value
                  ? "bg-foreground text-background border-transparent"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => setTipo(opcion.value)}
            >
              {opcion.label} ({opcion.count})
            </Button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-muted/30 border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
          {movimientos.length === 0
            ? "No hay movimientos de stock en este período."
            : "Ningún movimiento coincide con el filtro."}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-bold">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatearFecha(m.fecha)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {m.producto}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({m.variante})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.tipo === "INGRESO" ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          <ArrowUpCircle className="w-3 h-3 mr-1" /> Ingreso
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-rose-50 text-rose-700 border-rose-200"
                        >
                          <ArrowDownCircle className="w-3 h-3 mr-1" /> Egreso
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span
                        className={
                          m.tipo === "INGRESO"
                            ? "text-emerald-700"
                            : "text-rose-600"
                        }
                      >
                        {m.tipo === "INGRESO" ? "+" : "-"}
                        {m.cantidad}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-70 truncate">
                      {m.origen}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.usuario ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
