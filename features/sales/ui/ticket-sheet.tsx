"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Share2,
  Download,
  ShoppingBasket,
  Calendar,
  CreditCard,
  User,
  Hash,
  Package,
  CheckCircle2,
  Tag,
  Plus,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Split,
} from "lucide-react";
import { TicketData } from "@/entities/ventas/types";
import { ConfiguracionPOS } from "@/entities/config/types";

interface TicketSheetProps {
  ticket: TicketData | null;
  config: ConfiguracionPOS | null;
  onClose: () => void;
}

export function TicketSheet({
  ticket,
  config,
  onClose,
}: Readonly<TicketSheetProps>) {
  const nombreComercio = config?.posName || "Mi Comercio";
  const direccionComercio = config?.direccion || "Sin dirección";
  const whatsappComercio = config?.whatsapp || "";
  const mensajeDespedida = config?.mensaje_ticket || "¡Gracias por su compra!";

  // Calculamos el subtotal real sumando los items
  const subtotalCarrito =
    ticket?.items.reduce((acc, item) => {
      const precioUnitario = item.precioUnitario || item.precio || 0;
      return acc + precioUnitario * item.cantidad;
    }, 0) || 0;

  const compartirRecibo = () => {
    if (!ticket) return;

    let mensaje = `*🌿 ${nombreComercio.toUpperCase()} 🌿*\n\n`;
    mensaje += `*Transacción:* #${ticket.nroRecibo}\n`;
    mensaje += `*Fecha:* ${
      ticket.fecha ||
      new Date().toLocaleString("es-AR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    }\n`;
    mensaje += `--------------------------------\n`;

    ticket.items.forEach((item) => {
      const precioUnitario = item.precioUnitario || item.precio || 0;
      mensaje += `${item.cantidad}x ${item.nombre} (${item.variante})\n`;
      mensaje += `   $${(precioUnitario * item.cantidad).toLocaleString("es-AR")}\n`;
    });

    if (ticket.descuentoMonto && ticket.descuentoMonto > 0) {
      mensaje += `--------------------------------\n`;
      mensaje += `Subtotal: $${subtotalCarrito.toLocaleString("es-AR")}\n`;
      mensaje += `Descuento (${ticket.promocionNombre}): -$${ticket.descuentoMonto.toLocaleString("es-AR")}\n`;
    }

    mensaje += `--------------------------------\n`;
    mensaje += `*TOTAL PAGADO: $${ticket.total.toLocaleString("es-AR")}*\n\n`;

    // Mostrar pagos limpios en WhatsApp (Pago Único vs Pago Mixto)
    if (ticket.pagosDesglosados && ticket.pagosDesglosados.length > 1) {
      mensaje += `*Medios de Pago:*\n`;
      ticket.pagosDesglosados.forEach((p) => {
        mensaje += `🔸 ${p.nombre}: $${p.monto.toLocaleString("es-AR")}\n`;
      });
    } else {
      mensaje += `*Medio de pago:* ${ticket.metodoPago}\n`;
    }

    mensaje += `\n${mensajeDespedida}`;

    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const handleNativePrint = () => {
    window.print();
  };

  return (
    <>
      {/* ── CSS GLOBAL PARA IMPRESIÓN AISLADA DEL TICKET ── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #ticket-print-wrapper, #ticket-print-wrapper * {
            visibility: visible;
          }
          #ticket-print-wrapper {
            position: fixed;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 12px;
            margin: 0;
            background: white;
            color: black;
            z-index: 9999;
          }
        }
      `}</style>

      <Sheet
        open={ticket !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        {/* ── HEADER DE LA APP ─────────────────────────────────────────── */}
        <SheetContent
          side="right"
          className="w-full md:max-w-110 p-0 flex flex-col h-dvh overflow-hidden bg-background border-l border-border"
        >
          <SheetHeader className="flex-row items-center justify-between px-2 md:px-5 py-4 border-b border-border bg-card shrink-0 mt-4 sm:mt-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingBasket className="w-4 h-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-sm font-semibold text-foreground leading-tight">
                  Detalle de venta
                </SheetTitle>
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                  #{ticket?.nroRecibo}
                </p>
              </div>
            </div>
          </SheetHeader>

          {/* ── SCROLLABLE BODY  ─────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-2 space-y-2 md:px-5 md:py-5 md:space-y-4">
              {/* TOTAL CARD */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total cobrado
                    </span>
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-none text-[10px] font-semibold px-2 py-0.5 gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Pagada
                    </Badge>
                  </div>
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    ${ticket?.total?.toLocaleString("es-AR")}
                  </p>
                </div>
              </div>

              {/* RESUMEN FINANCIERO CON SOPORTE MULTI-PAGO */}
              {ticket?.montoNeto !== undefined && (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-muted-foreground/70" />{" "}
                    Resumen Financiero
                  </h3>

                  
                  
                  <div className="divide-y divide-border">
                    {/* Lista de Pagos Desglosados */}
                    {ticket.pagosDesglosados &&
                    ticket.pagosDesglosados.length > 1 ? (
                      <div className="px-4 py-3 bg-indigo-50/30 dark:bg-indigo-950/20">
                        <span className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-2">
                          <Split className="w-3.5 h-3.5" /> Métodos Utilizados
                        </span>
                        <div className="space-y-1.5 pl-5">
                          {ticket.pagosDesglosados.map((p, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-sm font-medium"
                            >
                              <span className="text-muted-foreground">
                                {p.nombre}
                              </span>
                              <span>${p.monto.toLocaleString("es-AR")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <DetailRow
                        icon={<CreditCard className="w-3.5 h-3.5" />}
                        label="Método de pago"
                        value={ticket.metodoPago}
                      />
                    )}

                    <DetailRow
                      icon={
                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
                      }
                      label="Cobro Bruto"
                      value={`$${ticket.total.toLocaleString("es-AR")}`}
                    />

                    {(ticket.comisionMonto ?? 0) > 0 ? (
                      <DetailRow
                        icon={
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
                        }
                        label="Comisión"
                        value={`-$${ticket.comisionMonto?.toLocaleString("es-AR")}`}
                      />
                    ) : (
                      <DetailRow
                        icon={
                          <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />
                        }
                        label="Comisión"
                        value="$0"
                      />
                    )}

                    {ticket.acreditacionDias !== undefined && (
                      <DetailRow
                        label="Acreditación"
                        value={
                          ticket.acreditacionDias === 0
                            ? "Inmediata"
                            : `En ${ticket.acreditacionDias} día(s)`
                        }
                      />
                    )}

                    <div className="bg-muted/40 flex items-center justify-between px-4 py-3 border-t border-border">
                      <span className="flex items-center gap-2 font-medium text-muted-foreground">
                        Ganancia Neta
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        ${ticket.montoNeto?.toLocaleString("es-AR")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TRANSACTION DETAILS */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground/70" />{" "}
                  <h3 className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Detalles de la Transacción
                  </h3>
                </div>

                <div className="rounded-xl border border-border bg-card divide-y divide-border">
                  <DetailRow
                    icon={<Hash className="w-3.5 h-3.5" />}
                    label="Nro. recibo"
                    value={`#${ticket?.nroRecibo}`}
                  />
                  <DetailRow
                    icon={<Calendar className="w-3.5 h-3.5" />}
                    label="Fecha y hora"
                    value={
                      ticket?.fecha ||
                      new Date().toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    }
                  />
                  <DetailRow
                    icon={<User className="w-3.5 h-3.5" />}
                    label="Vendedor"
                    value={ticket?.vendedor || "Administrador"}
                  />
                  {(ticket?.descuentoMonto ?? 0) > 0 && (
                    <DetailRow
                      icon={<Tag className="w-3.5 h-3.5 text-emerald-500" />}
                      label="Promoción"
                      value={ticket?.promocionNombre || "Descuento aplicado"}
                    />
                  )}
                </div>
              </div>

              {/* ITEMS */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Productos ({ticket?.items.length ?? 0})
                  </h3>
                </div>

                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {ticket?.items.map((item, idx) => {
                    const precioUnidad =
                      item.precioUnitario || item.precio || 0;
                    return (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {item.cantidad}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate leading-tight">
                            {item.nombre}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Talle: {item.variante}
                            {item.cantidad > 1 && (
                              <span className="ml-2 text-muted-foreground/70">
                                · ${precioUnidad.toLocaleString("es-AR")} c/u
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-foreground shrink-0">
                          $
                          {(precioUnidad * item.cantidad).toLocaleString(
                            "es-AR",
                          )}
                        </p>
                      </div>
                    );
                  })}

                  {/* Totals footer */}
                  <div className="px-4 py-3 bg-muted/40 space-y-1.5 border-t border-border">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span>${subtotalCarrito.toLocaleString("es-AR")}</span>
                    </div>

                    {(ticket?.descuentoMonto ?? 0) > 0 ? (
                      <div className="flex justify-between text-xs text-emerald-600 font-bold">
                        <span>Desc. ({ticket?.promocionNombre})</span>
                        <span>
                          -${ticket?.descuentoMonto?.toLocaleString("es-AR")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Descuentos</span>
                        <span>$0</span>
                      </div>
                    )}

                    <div className="my-1" />
                    <div className="flex justify-between text-sm font-bold text-foreground">
                      <span>Total</span>
                      <span>${ticket?.total?.toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-center text-[11px] text-muted-foreground pb-2">
                El comprobante ya fue registrado en el sistema.
              </p>
            </div>
          </div>

          {/* ── ACTIONS FOOTER ──────────────────────────────────── */}
          <div className="shrink-0 border-t border-border bg-card px-5 py-4 flex flex-col gap-3 z-10">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 h-11 text-sm font-semibold"
                onClick={handleNativePrint}
              >
                <Download className="w-4 h-4" />
                Descargar
              </Button>
              <Button
                className="flex-1 gap-2 h-11 text-sm font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0"
                onClick={compartirRecibo}
              >
                <Share2 className="w-4 h-4" />
                WhatsApp
              </Button>
            </div>
            <Button
              className="w-full bg-foreground text-background hover:bg-foreground/90"
              onClick={onClose}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Venta
            </Button>
          </div>

          {/* ── TICKET OCULTO PARA EL GENERADOR PDF / IMPRESORA TÉRMICA ── */}
          <div
            id="ticket-print-wrapper"
            className="absolute left-[-9999px] top-[-9999px]"
          >
            <div className="bg-white text-black p-5 font-mono leading-relaxed">
              <div className="text-center pb-4 border-b-2 border-dashed border-gray-400">
                <h2 className="text-xl font-bold uppercase tracking-widest mb-1">
                  {nombreComercio}
                </h2>
                <p className="text-xs text-gray-700">{direccionComercio}</p>
                {whatsappComercio && (
                  <p className="text-xs text-gray-700">
                    WhatsApp: {whatsappComercio}
                  </p>
                )}
              </div>

              <div className="py-3 border-b-2 border-dashed border-gray-400 space-y-1 text-sm">
                <p>
                  Comprobante{" "}
                  <span className="font-bold">#{ticket?.nroRecibo}</span>
                </p>
                <p>
                  {ticket?.fecha ||
                    new Date().toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                </p>
                <p>Vend: {ticket?.vendedor || "Administrador"}</p>
              </div>

              <div className="py-4 border-b-2 border-dashed border-gray-400 space-y-3">
                {ticket?.items.map((item, idx) => {
                  const precioUnitario =
                    item.precioUnitario || item.precio || 0;
                  const totalItem = precioUnitario * item.cantidad;
                  return (
                    <div key={idx} className="flex flex-col">
                      <p className="font-bold uppercase leading-tight text-sm">
                        {item.cantidad}x {item.nombre}{" "}
                        {item.variante && `(${item.variante})`}
                      </p>
                      <div className="flex justify-between items-center text-gray-700 text-xs mt-0.5">
                        <span>
                          ${precioUnitario.toLocaleString("es-AR")} c/u
                        </span>
                        <span className="font-bold text-black text-sm">
                          ${totalItem.toLocaleString("es-AR")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="py-3 border-b-2 border-dashed border-gray-400 space-y-1.5 text-sm">
                <div className="flex justify-between items-center">
                  <span>Subtotal</span>
                  <span>${subtotalCarrito.toLocaleString("es-AR")}</span>
                </div>

                {(ticket?.descuentoMonto ?? 0) > 0 && (
                  <div className="flex justify-between items-center text-gray-700">
                    <span className="truncate pr-2">
                      Desc. ({ticket?.promocionNombre})
                    </span>
                    <span>
                      -${ticket?.descuentoMonto?.toLocaleString("es-AR")}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center font-semibold text-base pt-2 mt-2 border-t border-gray-300">
                  <span>TOTAL</span>
                  <span>${ticket?.total?.toLocaleString("es-AR")}</span>
                </div>

                {/* 🚀 IMPRESIÓN MÉTODOS DE PAGO MIXTOS */}
                <div className="pt-2 mt-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                    Medios de pago
                  </p>
                  {ticket?.pagosDesglosados &&
                  ticket.pagosDesglosados.length > 1 ? (
                    ticket.pagosDesglosados.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-xs font-bold uppercase"
                      >
                        <span>{p.nombre}</span>
                        <span>${p.monto.toLocaleString("es-AR")}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs uppercase font-bold">
                      {ticket?.metodoPago}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-center pt-4 text-xs space-y-1">
                <p className="font-bold">{mensajeDespedida}</p>
                <p className="text-gray-500">
                  Documento no válido como factura
                </p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ── HELPER ───────────────────────────────────────────────────── */
function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <span className="text-muted-foreground/60">{icon}</span>
        {label}
      </span>
      <span className="text-xs font-medium text-foreground text-right truncate max-w-[55%]">
        {value}
      </span>
    </div>
  );
}
