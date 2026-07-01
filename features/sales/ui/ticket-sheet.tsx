"use client";

import { useState, type ReactNode } from "react";
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
  Loader2,
  ShoppingBasket,
  Calendar,
  CreditCard,
  User,
  Hash,
  Package,
  Tag,
  Wallet,
} from "lucide-react";
import { TicketData } from "@/entities/ventas/types";
import { ConfiguracionPOS } from "@/entities/config/types";
import { TicketPrintable } from "./ticket-printable";
import { downloadSaleReceiptPdf } from "./download-sale-receipt-pdf";
import { buildWhatsappMessage } from "../utils/whatsapp-helper";
import {
  formatTicketMoney,
  getTicketFinancialSummary,
  getTicketSubtotal,
} from "./ticket-utils";
import { toast } from "sonner";

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
  const [isDownloading, setIsDownloading] = useState(false);
  const subtotalCarrito = getTicketSubtotal(ticket);
  const { esFiado, montoCobrado, montoPendiente } =
    getTicketFinancialSummary(ticket);
  const tieneSaldoPendiente =
    Number(ticket?.montoPendiente ?? montoPendiente) > 0.05 ||
    montoPendiente > 0.05;
  const estadoEsFiado =
    esFiado || Boolean(ticket?.esFiadoDirecto) || tieneSaldoPendiente;
  const badgeEstadoLabel = estadoEsFiado
    ? tieneSaldoPendiente
      ? "PENDIENTE DE PAGO"
      : "CUENTA CORRIENTE"
    : "PAGADO";
  const estadoTexto = estadoEsFiado
    ? tieneSaldoPendiente
      ? "Pendiente de pago"
      : "Cuenta corriente"
    : "Pagado";

  const compartirRecibo = () => {
    if (!ticket) return;

    const mensaje = buildWhatsappMessage(ticket, config, subtotalCarrito);
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const handleDownloadPDF = async () => {
    if (!ticket) return;

    setIsDownloading(true);
    const success = await downloadSaleReceiptPdf(ticket, config);
    setIsDownloading(false);

    if (success) {
      toast.success("Comprobante descargado con éxito");
    } else {
      toast.error("Ocurrió un error al generar el PDF");
    }
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html,
          body {
            width: 80mm;
            height: auto;
            margin: 0;
            padding: 0;
            background: white;
          }

          .ticket-screen-only {
            display: none !important;
          }

          .ticket-sheet-print-scope {
            position: static !important;
            width: 80mm !important;
            max-width: 80mm !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            transform: none !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          #ticket-print-wrapper {
            display: block !important;
            width: 80mm;
            min-height: 0;
            margin: 0;
            padding: 0;
            background: white;
            color: black;
          }
        }
      `}</style>

      <Sheet
        open={ticket !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent
          side="right"
          className="ticket-sheet-print-scope w-full md:max-w-110 p-0 flex flex-col h-dvh overflow-hidden bg-background border-l border-border"
        >
          <div className="ticket-screen-only flex min-h-0 flex-1 flex-col">
            <SheetHeader className="flex-row items-center justify-between px-2 md:px-5 py-4 border-b border-border bg-card shrink-0 mt-4 sm:mt-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShoppingBasket className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-md font-semibold text-foreground leading-tight">
                    Detalle de venta
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                    #{ticket?.nroRecibo}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-2 space-y-2 md:px-5 md:py-5 md:space-y-4">
                <div className="rounded-xl border border-border bg-card p-5 text-center">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Total
                    </p>

                    <Badge
                      variant="outline"
                      className={`w-fit border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                        estadoEsFiado
                          ? "border-accent-orange bg-accent-orange/10 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {badgeEstadoLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-3xl font-semibold text-left text-foreground">
                    {formatTicketMoney(ticket?.total)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground/70" />
                    <h3 className="text-xs font-medium text-foreground uppercase tracking-wider">
                      Detalle de Transaccion
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
                    <DetailRow
                      icon={<User className="w-3.5 h-3.5" />}
                      label="Cliente"
                      value={ticket?.clienteNombre || "Consumidor final"}
                    />
                    {(ticket?.descuentoMonto ?? 0) > 0 && (
                      <DetailRow
                        icon={<Tag className="w-3.5 h-3.5 text-neutral-900" />}
                        label="Promocion"
                        value={ticket?.promocionNombre || "Descuento aplicado"}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-muted-foreground/70" />
                    <h3 className="text-xs font-medium text-foreground uppercase tracking-wider">
                      Totales
                    </h3>
                  </div>

                  <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                    <DetailRow
                      icon={<CreditCard className="w-3.5 h-3.5" />}
                      label="Total de la venta"
                      value={formatTicketMoney(ticket?.total)}
                    />
                    <DetailRow
                      icon={<CreditCard className="w-3.5 h-3.5" />}
                      label={estadoEsFiado ? "Pagado (Anticipo)" : "Pagado"}
                      value={formatTicketMoney(
                        estadoEsFiado ? montoCobrado : ticket?.total,
                      )}
                    />
                    <DetailRow
                      icon={<Wallet className="w-3.5 h-3.5" />}
                      label="Saldo pendiente"
                      value={formatTicketMoney(
                        estadoEsFiado ? montoPendiente : 0,
                      )}
                    />
                    <div className="flex items-center justify-between px-4 py-3 gap-4">
                      <span className="text-xs text-muted-foreground">
                        Estado
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          estadoEsFiado ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {estadoTexto}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-xs font-medium text-foreground uppercase tracking-wider">
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
                                  {formatTicketMoney(precioUnidad)} c/u
                                </span>
                              )}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-foreground shrink-0">
                            {formatTicketMoney(precioUnidad * item.cantidad)}
                          </p>
                        </div>
                      );
                    })}

                    <div className="px-4 py-3 bg-muted/40 space-y-1.5 border-t border-border">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{formatTicketMoney(subtotalCarrito)}</span>
                      </div>

                      {(ticket?.descuentoMonto ?? 0) > 0 ? (
                        <div className="flex justify-between text-xs text-emerald-600 font-bold">
                          <span>Desc. ({ticket?.promocionNombre})</span>
                          <span>
                            -{formatTicketMoney(ticket?.descuentoMonto)}
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
                        <span>{formatTicketMoney(ticket?.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-card px-5 py-4 flex flex-col gap-3 z-10">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2 h-11 text-sm font-semibold"
                  onClick={handleDownloadPDF}
                  disabled={isDownloading || !ticket}
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Descargar Comprobante
                </Button>
                <Button
                  className="flex-1 gap-2 h-11 text-sm font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0"
                  onClick={compartirRecibo}
                >
                  <Share2 className="w-4 h-4" />
                  WhatsApp
                </Button>
              </div>
            </div>
          </div>

          <TicketPrintable ticket={ticket} config={config} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
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
