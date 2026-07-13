"use client";

import Image from "next/image";
import { Tag } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatearPromoPublica } from "@/shared/components/cart-sidebar/cart-sidebar-utils";
import { PromocionDB } from "@/shared/components/cart-sidebar/types";

interface CartFooterPublicoProps {
  totalCarrito: number;
  costoEnvio?: number;
  promocionesElegibles?: PromocionDB[];
  whatsappHref: string;
  puedeEnviar: boolean;
  motivoInvalido?: string;
  onEnviarPedido: () => void;
  onClearCart: () => void;
  isPending?: boolean;
}

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function CartFooterPublico({
  totalCarrito,
  costoEnvio = 0,
  promocionesElegibles = [],
  whatsappHref,
  puedeEnviar,
  motivoInvalido,
  onEnviarPedido,
  onClearCart,
  isPending = false,
}: Readonly<CartFooterPublicoProps>) {
  const handleClick = () => {
    if (!puedeEnviar || whatsappHref === "#") return;
    window.open(whatsappHref, "_blank", "noopener,noreferrer");
    onEnviarPedido();
  };

  const totalFinal = totalCarrito + costoEnvio;

  return (
    <div className="shrink-0 bg-card  p-5 z-10">
      {promocionesElegibles.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {promocionesElegibles.map((promo) => (
            <div
              key={promo.id}
              className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
            >
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span>{formatearPromoPublica(promo)}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            El descuento se confirma al coordinar por WhatsApp, no está
            aplicado en el total de abajo.
          </p>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {costoEnvio > 0 && (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(totalCarrito)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Envío</span>
              <span>{formatCurrency(costoEnvio)}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Total
          </span>
          <span className="text-2xl font-bold text-foreground">
            {formatCurrency(totalFinal)}
          </span>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleClick}
        disabled={!puedeEnviar || isPending}
        className="w-full flex items-center justify-center gap-3 h-12 rounded-lg bg-[#25D366] hover:bg-[#1EBE57] text-white font-bold text-sm uppercase tracking-widest shadow-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Image src="/whatsappp.png" alt="Whatsapp" width={20} height={20} />
        Enviar Pedido
      </Button>
      {!puedeEnviar && motivoInvalido && (
        <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
          {motivoInvalido}
        </p>
      )}

      <button
        onClick={onClearCart}
        disabled={isPending}
        className="w-full mt-4 text-xs tracking-wide text-muted-foreground hover:text-destructive transition-colors font-medium disabled:opacity-50 cursor-pointer"
      >
        Vaciar carrito
      </button>
    </div>
  );
}
