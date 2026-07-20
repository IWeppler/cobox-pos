"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Wallet,
  History,
  Info,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  TrendingUp,
  Tags,
  Star,
  BookmarkCheck,
  Edit2,
  PlusCircle,
} from "lucide-react";
import { getClienteDetalleAction } from "../actions/manage-clients";
import { calcularDiasVencido } from "../lib/calcular-dias-vencido";
import {
  calcularRecargoMoraTotal,
  calcularSaldoConRecargo,
  RecargoMoraConfig,
} from "../lib/calcular-saldo-con-recargo";
import { AdjustClientBalanceModal } from "./adjust-client-balance-modal";
import { EditClientModal } from "./edit-client-modal";
import { RegisterPaymentModal } from "./register-payment-modal";
import { Cliente, CuentaCorrienteMovimiento } from "@/entities/clientes/type";
import { MetodoPagoPOS } from "@/shared/components/cart-sidebar/types";
import { formatearFechaHora, formatearMoneda } from "@/shared/utils/formatters";
import { getSupabaseRelation, SupabaseRelation } from "@/entities/ventas/types";

interface ReservaResumen {
  id: string;
  nota?: string | null;
  estado: "ACTIVA" | "CONFIRMADA" | "DEVUELTA";
  creado_en: string;
  producto?: SupabaseRelation<{ nombre?: string | null }>;
  variante?: SupabaseRelation<{
    nombre_display?: string | null;
    precio?: number | null;
  }>;
}

interface VentaResumen {
  id: string;
  total: number | string;
  estado_pago?: string | null;
  monto_pendiente?: number | string | null;
  fecha_venta: string;
  fecha_vencimiento?: string | null;
  ventas_items?: {
    cantidad: number | string;
    producto?: SupabaseRelation<{
      nombre?: string | null;
      tipo?: string | null;
    }>;
  }[];
}

interface ClientDetailSheetProps {
  cliente: Cliente | null;
  metodosPago: MetodoPagoPOS[];
  entregaMinimaActiva?: boolean;
  recargoMoraConfig: RecargoMoraConfig;
  onClose: () => void;
}

export function ClientDetailSheet({
  cliente,
  metodosPago,
  entregaMinimaActiva = false,
  recargoMoraConfig,
  onClose,
}: Readonly<ClientDetailSheetProps>) {
  const [data, setData] = useState<{
    movimientos: CuentaCorrienteMovimiento[];
    ventas: VentaResumen[];
    reservas: ReservaResumen[];
  }>({
    movimientos: [],
    ventas: [],
    reservas: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    if (!cliente) return;
    const fetchDetalles = async () => {
      setIsLoading(true);
      const result = await getClienteDetalleAction(cliente.id);
      setData(result);
      setIsLoading(false);
    };
    fetchDetalles();
  }, [cliente]);

  const stats = useMemo(() => {
    const totalComprado = data.ventas.reduce(
      (total, venta) => total + Number(venta.total || 0),
      0,
    );
    const totalTickets = data.ventas.length;
    const ticketPromedio = totalTickets > 0 ? totalComprado / totalTickets : 0;
    const categorias = new Map<string, number>();

    for (const venta of data.ventas) {
      for (const item of venta.ventas_items ?? []) {
        const producto = getSupabaseRelation(item.producto);
        const tipo = producto?.tipo?.trim();

        if (tipo) {
          categorias.set(tipo, (categorias.get(tipo) ?? 0) + 1);
        }
      }
    }

    const favCategory =
      [...categorias.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

    return {
      totalComprado,
      totalTickets,
      ticketPromedio,
      favCategory,
    };
  }, [data.ventas]);

  const recargoMora = useMemo(() => {
    const ticketsConSaldo = data.ventas.filter(
      (venta) => Number(venta.monto_pendiente || 0) > 0,
    );
    return calcularRecargoMoraTotal(ticketsConSaldo, recargoMoraConfig);
  }, [data.ventas, recargoMoraConfig]);

  if (!cliente) return null;
  const saldo = Number(cliente.saldo_pendiente || 0);

  const fechaVencimiento = cliente.fecha_vencimiento_deuda ?? null;
  const diasVencido = calcularDiasVencido(fechaVencimiento);
  const mostrarAlertaVencimiento =
    diasVencido !== null && diasVencido > 0 && saldo > 0;
  const fechaVencimientoFormateada = fechaVencimiento
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(fechaVencimiento))
    : null;
  const favCategoryLabel =
    stats.favCategory === "-"
      ? "-"
      : `${stats.favCategory.charAt(0).toUpperCase()}${stats.favCategory.slice(1)}`;

  return (
    <Sheet open={cliente !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:w-4xl! p-0 flex flex-col h-dvh bg-card border-l border-border"
      >
        {/* CABECERA (Fija) */}
        <SheetHeader className="p-6 border-b border-border shrink-0 bg-muted/10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div>
                <SheetTitle className="text-xl font-bold text-foreground">
                  {cliente.nombre}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  {saldo > 0 ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] uppercase font-bold tracking-wider"
                    >
                      Con Deuda
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] uppercase font-bold tracking-wider"
                    >
                      Al día
                    </Badge>
                  )}
                  {cliente.telefono && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {cliente.telefono}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAdjustOpen(true)}
              className="h-8 text-xs font-bold shadow-none border-border"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              Cargar saldo inicial
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
              className="h-8 text-xs font-bold shadow-none border-border"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              Editar datos
            </Button>
          </div>
        </SheetHeader>

        {/* CONTENIDO SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <Tabs
            defaultValue="historial"
            className="w-full h-full flex flex-col"
          >
            <div className="px-2 pt-4 shrink-0">
              <TabsList className="grid w-full grid-cols-4 bg-muted/50 border border-border h-12">
                <TabsTrigger
                  value="historial"
                  className="text-xs font-bold uppercase tracking-wide sm:tracking-widest"
                >
                  <Wallet className="w-3.5 h-3.5 mr-0.2 hidden sm:block" />{" "}
                  Historial
                </TabsTrigger>
                <TabsTrigger
                  value="ventas"
                  className="text-xs font-bold uppercase tracking-wide sm:tracking-widest"
                >
                  <History className="w-3.5 h-3.5 mr-0.2 hidden sm:block" />{" "}
                  Ventas
                </TabsTrigger>
                <TabsTrigger
                  value="reservas"
                  className="text-xs font-bold uppercase tracking-wide sm:tracking-widest"
                >
                  <BookmarkCheck className="w-3.5 h-3.5 mr-0.2 hidden sm:block" />{" "}
                  Reservas
                </TabsTrigger>
                <TabsTrigger
                  value="info"
                  className="text-xs font-bold uppercase tracking-wide sm:tracking-widest"
                >
                  <Info className="w-3.5 h-3.5 mr-0.2 hidden sm:block" /> Info
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <>
                  {/* PESTAÑA: historial (CUENTA CORRIENTE) */}
                  <TabsContent
                    value="historial"
                    className="m-0 space-y-6 animate-in fade-in-50"
                  >
                    <div className="bg-card border border-border rounded-xl p-3 flex flex-col md:flex-row items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Saldo Actual
                        </p>
                        <p className="text-2xl font-semibold text-foreground">
                          {formatearMoneda(saldo)}
                        </p>
                        {fechaVencimientoFormateada && (
                          <div className="flex justify-betweenitems-center gap-2 mt-2">
                            <p className="text-[10px] text-muted-foreground">
                              Vence: {fechaVencimientoFormateada}
                            </p>
                            {mostrarAlertaVencimiento && (
                              <Badge
                                variant="outline"
                                className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] uppercase font-bold tracking-wider"
                              >
                                Vencido hace {diasVencido} día
                                {diasVencido === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>
                        )}
                        {recargoMora.totalRecargo > 0 && (
                          <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-1">
                            + {formatearMoneda(recargoMora.totalRecargo)} de
                            recargo por mora estimado
                          </p>
                        )}
                      </div>
                      {saldo > 0 && (
                        <RegisterPaymentModal
                          cliente={cliente}
                          metodosPago={metodosPago}
                          recargoMoraEstimado={recargoMora.totalRecargo}
                        />
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 border-b border-border/50 pb-2">
                        Libro Mayor
                      </h3>
                      {data.movimientos.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic text-center py-8">
                          No hay movimientos registrados.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {data.movimientos.map((mov) => (
                            <div
                              key={mov.id}
                              className="flex items-center justify-between p-3 bg-background border border-border rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-2 rounded-full ${mov.tipo === "DEBITO" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}
                                >
                                  {mov.tipo === "DEBITO" ? (
                                    <ArrowUpRight className="w-4 h-4" />
                                  ) : (
                                    <ArrowDownRight className="w-4 h-4" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {mov.descripcion ||
                                      (mov.tipo === "DEBITO"
                                        ? "Cargo por Compra"
                                        : "Abono a Cuenta")}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {formatearFechaHora(mov.creado_en)}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`font-semibold ${mov.tipo === "DEBITO" ? "text-rose-600" : "text-emerald-600"}`}
                              >
                                {mov.tipo === "DEBITO" ? "+" : "-"}
                                {formatearMoneda(Number(mov.monto))}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* PESTAÑA: VENTAS */}
                  <TabsContent
                    value="ventas"
                    className="m-0 animate-in fade-in-50"
                  >
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 border-b border-border/50 pb-2">
                      Historial de Tickets
                    </h3>
                    {data.ventas.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic text-center py-8">
                        No hay compras registradas.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {data.ventas.map((venta) => {
                          const idCorto = venta.id.split("-")[0].toUpperCase();
                          const montoPendienteVenta = Number(
                            venta.monto_pendiente || 0,
                          );
                          const saldoTicket =
                            montoPendienteVenta > 0
                              ? calcularSaldoConRecargo(
                                  {
                                    monto_pendiente: montoPendienteVenta,
                                    fecha_vencimiento:
                                      venta.fecha_vencimiento ?? null,
                                  },
                                  recargoMoraConfig,
                                )
                              : null;

                          return (
                            <div
                              key={venta.id}
                              className="flex flex-col p-4 bg-background border border-border rounded-lg gap-2"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-sm text-foreground">
                                    Ticket #{idCorto}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {formatearFechaHora(venta.fecha_venta)}
                                  </p>
                                </div>
                                <span className="font-semibold text-emerald-700 dark:text-emerald-500">
                                  {formatearMoneda(Number(venta.total))}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                {venta.ventas_items
                                  ?.map(
                                    (item) =>
                                      `${item.cantidad}x ${
                                        getSupabaseRelation(item.producto)
                                          ?.nombre || "Producto eliminado"
                                      }`,
                                  )
                                  .join(", ")}
                              </div>
                              {saldoTicket && (
                                <div className="flex items-center justify-between gap-2 mt-1 pt-2 border-t border-border/40">
                                  <Badge
                                    variant="outline"
                                    className={
                                      saldoTicket.estaVencido
                                        ? "bg-rose-50 text-rose-700 border-rose-200 text-[10px] uppercase font-bold tracking-wider"
                                        : "bg-amber-50 text-amber-700 border-amber-200 text-[10px] uppercase font-bold tracking-wider"
                                    }
                                  >
                                    {saldoTicket.estaVencido
                                      ? "Vencido"
                                      : "Pendiente"}
                                  </Badge>
                                  <span className="text-xs font-semibold text-foreground">
                                    Saldo:{" "}
                                    {formatearMoneda(
                                      saldoTicket.saldoConRecargo,
                                    )}
                                    {saldoTicket.montoRecargo > 0 && (
                                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-normal ml-1">
                                        (incluye{" "}
                                        {formatearMoneda(
                                          saldoTicket.montoRecargo,
                                        )}{" "}
                                        de recargo)
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* PESTAÑA: RESERVAS */}
                  <TabsContent
                    value="reservas"
                    className="m-0 animate-in fade-in-50"
                  >
                    <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 border-b border-border/50 pb-2">
                      Reservas
                    </h3>
                    {data.reservas.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic text-center py-8">
                        No hay reservas registradas.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {data.reservas.map((reserva) => {
                          const producto = getSupabaseRelation(
                            reserva.producto,
                          );
                          const variante = getSupabaseRelation(
                            reserva.variante,
                          );
                          const estadoBadge =
                            reserva.estado === "ACTIVA"
                              ? {
                                  label: "Activa",
                                  className:
                                    "bg-blue-50 text-blue-700 border-blue-200",
                                }
                              : reserva.estado === "CONFIRMADA"
                                ? {
                                    label: "Confirmada",
                                    className:
                                      "bg-emerald-50 text-emerald-700 border-emerald-200",
                                  }
                                : {
                                    label: "Devuelta",
                                    className:
                                      "bg-muted text-muted-foreground border-border",
                                  };

                          return (
                            <div
                              key={reserva.id}
                              className="flex items-center justify-between p-3 bg-background border border-border rounded-lg gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {producto?.nombre || "Producto eliminado"}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {variante?.nombre_display || "-"} ·{" "}
                                  {formatearFechaHora(reserva.creado_en)}
                                </p>
                                {reserva.nota ? (
                                  <p className="text-xs text-muted-foreground mt-1 italic">
                                    {reserva.nota}
                                  </p>
                                ) : null}
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-[10px] uppercase font-bold tracking-wider shrink-0 ${estadoBadge.className}`}
                              >
                                {estadoBadge.label}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* PESTAÑA: INFO */}
                  <TabsContent
                    value="info"
                    className="m-0 animate-in fade-in-50 space-y-4"
                  >
                    <div className="bg-muted/30 p-4 rounded-xl border border-border space-y-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Documento / DNI
                        </p>
                        <p className="font-medium text-sm mt-0.5">
                          {cliente.dni || "No registrado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Email
                        </p>
                        <p className="font-medium text-sm mt-0.5">
                          {cliente.email || "No registrado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Notas internas
                        </p>
                        <p className="font-medium text-sm mt-0.5 whitespace-pre-wrap">
                          {cliente.notas || "Sin notas"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-5 pt-5 border-t border-border/50">
                      <div className="min-w-0 rounded-lg bg-background/70 border border-border/60 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Total Gasto
                        </div>
                        <p className="mt-1 text-base font-semibold text-foreground truncate">
                          {formatearMoneda(stats.totalComprado)}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-background/70 border border-border/60 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <Tags className="h-3.5 w-3.5" />
                          Tickets
                        </div>
                        <p className="mt-1 text-base font-semibold text-foreground truncate">
                          {stats.totalTickets}
                        </p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-background/70 border border-border/60 p-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20" />
                          Favorito
                        </div>
                        <p className="mt-1 text-base font-semibold text-foreground truncate">
                          {favCategoryLabel}
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </div>
      </SheetContent>

      <AdjustClientBalanceModal
        cliente={isAdjustOpen ? cliente : null}
        onClose={() => setIsAdjustOpen(false)}
      />
      <EditClientModal
        cliente={isEditOpen ? cliente : null}
        onClose={() => setIsEditOpen(false)}
        entregaMinimaActiva={entregaMinimaActiva}
      />
    </Sheet>
  );
}
