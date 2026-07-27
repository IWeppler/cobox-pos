import { Package, Bookmark } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { formatearFechaHora } from "@/shared/utils/formatters";
import type { QuiebreProducto } from "../lib/detectar-quiebres";

type StockCriticoItem = { nombre: string; variante: string; cantidad: number };

type ReservaActiva = {
  id: string;
  nombreProducto: string;
  varianteNombre: string | null;
  clienteNombre: string | null;
  vendedoraNombre: string | null;
  creadoEn: string;
  vencida: boolean;
};

interface AtencionRequeridaCardProps {
  quiebres: QuiebreProducto[];
  stockCritico: StockCriticoItem[];
  cantidadBajasPendientes: number;
  reservasActivas: ReservaActiva[];
}

/**
 * Tabs [Stock Crítico | Reservas] — antes eran 2 cards separadas
 * ("Alertas de stock" y "Reservas activas"), ahora conviven en una columna
 * fija sin crecer verticalmente (fila 2 del layout v2). Reservas sigue
 * siendo por ANTIGÜEDAD (hace cuánto está activa), nunca "por vencer": el
 * sistema no tiene un campo de vencimiento para reservas.
 */
export function AtencionRequeridaCard({
  quiebres,
  stockCritico,
  cantidadBajasPendientes,
  reservasActivas,
}: Readonly<AtencionRequeridaCardProps>) {
  const sinNovedadesStock =
    quiebres.length === 0 &&
    stockCritico.length === 0 &&
    cantidadBajasPendientes === 0;

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden h-full">
      <Tabs defaultValue="stock" className="flex flex-col h-full gap-0">
        <div className="px-3 pt-3 shrink-0">
          <TabsList className="w-full">
            <TabsTrigger value="stock" className="gap-1.5">
              <Package className="w-3.5 h-3.5" /> Stock Crítico
            </TabsTrigger>
            <TabsTrigger value="reservas" className="gap-1.5">
              <Bookmark className="w-3.5 h-3.5" /> Reservas
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stock" className="flex-1 overflow-y-auto p-3 pt-2 mt-0">
          {sinNovedadesStock ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-muted-foreground italic">
                Inventario saludable.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {quiebres.slice(0, 3).map((q) => (
                <div
                  key={q.productoId}
                  className="flex items-center justify-between gap-2 text-xs bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900 rounded-lg px-2.5 py-1.5"
                >
                  <span className="truncate text-foreground font-medium" title={q.nombre}>
                    {q.nombre}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 rounded">
                    Quiebre · {q.unidadesVendidas} u. vendidas
                  </span>
                </div>
              ))}
              {stockCritico.slice(0, 3).map((s, idx) => (
                <div
                  key={`${s.nombre}-${s.variante}-${idx}`}
                  className="flex items-center justify-between gap-2 text-xs bg-muted/40 border border-border rounded-lg px-2.5 py-1.5"
                >
                  <span className="truncate text-foreground" title={`${s.nombre} · ${s.variante}`}>
                    {s.nombre} · {s.variante}
                  </span>
                  <span className="shrink-0 text-amber-700 dark:text-amber-400 font-medium">
                    {s.cantidad} u.
                  </span>
                </div>
              ))}
              {cantidadBajasPendientes > 0 && (
                <div className="flex items-center gap-2 text-xs bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0" />
                  {cantidadBajasPendientes} merma
                  {cantidadBajasPendientes === 1 ? "" : "s"} pendiente
                  {cantidadBajasPendientes === 1 ? "" : "s"} de revisión
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reservas" className="flex-1 overflow-y-auto p-3 pt-2 mt-0">
          {reservasActivas.length > 0 ? (
            <div className="space-y-1.5">
              {reservasActivas.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between gap-2 text-xs rounded-lg px-2.5 py-1.5 border ${
                    r.vencida
                      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"
                      : "bg-muted/40 border-border"
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className="font-medium text-foreground truncate"
                      title={r.nombreProducto}
                    >
                      {r.nombreProducto}
                      {r.varianteNombre ? ` · ${r.varianteNombre}` : ""}
                    </p>
                    <p className="text-muted-foreground truncate">
                      desde {formatearFechaHora(r.creadoEn)}
                      {r.vendedoraNombre ? ` · ${r.vendedoraNombre}` : ""}
                      {r.clienteNombre ? ` · para ${r.clienteNombre}` : ""}
                    </p>
                  </div>
                  {r.vencida && (
                    <span className="shrink-0 text-amber-700 dark:text-amber-400 font-medium">
                      +24h
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-muted-foreground italic">
                Sin reservas activas.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
