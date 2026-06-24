"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { DescuentoDetalle } from "./types";
import { PaymentModal } from "./payment-modal";
import Link from "next/link";

interface CartSidebarFooterProps {
  isPOSMode: boolean;
  isPending: boolean;
  totalCarrito: number;
  totalFinal: number;
  descuentoDetalle: DescuentoDetalle;
  whatsappHref: string;
  onConfirmarVentaPOS: (montoPagado?: number | null) => void;
  onEnviarPedidoWhatsApp: () => void;
  onClearCart: () => void;
}

export function CartSidebarFooter({
  isPOSMode,
  isPending,
  totalCarrito,
  totalFinal,
  descuentoDetalle,
  whatsappHref,
  onConfirmarVentaPOS,
  onEnviarPedidoWhatsApp,
  onClearCart,
}: Readonly<CartSidebarFooterProps>) {
  const [modalAbierto, setModalAbierto] = useState(false);

  const handleCobrar = () => setModalAbierto(true);

  const handleConfirmar = (montoPagado: number | null) => {
    setModalAbierto(false);
    onConfirmarVentaPOS(montoPagado);
  };

  return (
    <>
      <div className="shrink-0 border-t border-border bg-card p-5 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-10">
        {descuentoDetalle.monto > 0 && (
          <div className="space-y-1.5 mb-3">
            <div className="flex items-center justify-between text-muted-foreground text-sm">
              <span>Subtotal</span>
              <span>${totalCarrito.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex items-center justify-between text-foreground font-semibold text-sm">
              <span>Promo: {descuentoDetalle.nombre}</span>
              <span>-${descuentoDetalle.monto.toLocaleString("es-AR")}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">
            Total a cobrar
          </span>
          <span className="text-2xl font-semibold text-foreground">
            ${totalFinal.toLocaleString("es-AR")}
          </span>
        </div>

        {isPOSMode ? (
          <Button
            onClick={handleCobrar}
            disabled={isPending}
            className="w-full h-12 flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 text-background transition-colors shadow-none"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" /> Cobrar Venta
              </>
            )}
          </Button>
        ) : (
          <Link
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onEnviarPedidoWhatsApp}
            className="w-full flex items-center justify-center gap-3 h-12 rounded-lg bg-[#25D366] hover:bg-[#1EBE57] text-white font-bold text-sm uppercase tracking-widest shadow-none"
          >
            <Image src="/whatsappp.png" alt="Whatsapp" width={20} height={20} />
            Enviar Pedido
          </Link>
        )}

        <button
          onClick={onClearCart}
          disabled={isPending}
          className="w-full mt-4 text-xs tracking-wide text-muted-foreground hover:text-destructive transition-colors font-medium disabled:opacity-50 cursor-pointer"
        >
          Vaciar {isPOSMode ? "venta" : "carrito"}
        </button>
      </div>

      {/* Modal de cobro */}
      {modalAbierto && (
        <PaymentModal
          totalFinal={totalFinal}
          isPending={isPending}
          onConfirm={handleConfirmar}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </>
  );
}
