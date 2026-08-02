"use client";

import Image from "next/image";
import { CreditCard, Tag } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatearPromoPublica } from "@/shared/components/cart-sidebar/cart-sidebar-utils";
import { PromocionDB } from "@/shared/components/cart-sidebar/types";

interface CartFooterPublicoProps {
  totalCarrito: number;
  /** Total de items ya con las promos calculables restadas. Default: sin descuento. */
  totalConDescuento?: number;
  costoEnvio?: number;
  /** Ya restadas del total: todo lo calculable menos METODO_PAGO. */
  calculablesAplicadas?: PromocionDB[];
  /** METODO_PAGO: aviso aparte, no afecta el total (se define después por WhatsApp). */
  informativasCondicionales?: PromocionDB[];
  /** Métodos con recargo activo. Informativo, igual criterio que las promos
   * condicionales: el precio se cierra en el mostrador, acá solo se avisa
   * para que el total no sea una sorpresa al momento de pagar. */
  metodosConRecargo?: { id: string; nombre: string; recargo_porcentaje: number }[];
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
  totalConDescuento,
  costoEnvio = 0,
  calculablesAplicadas = [],
  informativasCondicionales = [],
  metodosConRecargo = [],
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

  const totalSinDescuento = totalCarrito + costoEnvio;
  const totalFinal = (totalConDescuento ?? totalCarrito) + costoEnvio;
  const hayDescuento = totalFinal < totalSinDescuento;

  return (
    <div className="shrink-0 bg-card  p-5 z-10">
      {calculablesAplicadas.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {calculablesAplicadas.map((promo) => (
            <div
              key={promo.id}
              className="flex items-center gap-2 rounded-md border border-success/20 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success"
            >
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span>{formatearPromoPublica(promo)}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Descuento ya aplicado en el total de abajo.
          </p>
        </div>
      )}

      {informativasCondicionales.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {informativasCondicionales.map((promo) => (
            <div
              key={promo.id}
              className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-500/20 dark:text-amber-100 px-2.5 py-1.5 text-xs font-medium text-warning"
            >
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span>{formatearPromoPublica(promo)}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Este descuento depende del método de pago: se confirma al
            coordinar por WhatsApp, no está aplicado en el total de abajo.
          </p>
        </div>
      )}

      {metodosConRecargo.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {metodosConRecargo.map((metodo) => (
            <div
              key={metodo.id}
              className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-500/20 dark:text-amber-100 px-2.5 py-1.5 text-xs font-medium text-warning"
            >
              <CreditCard className="h-3.5 w-3.5 shrink-0" />
              <span>
                {metodo.nombre}: +{metodo.recargo_porcentaje}% de recargo
              </span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            El recargo se suma solo si pagás con ese método — no está incluido
            en el total de abajo.
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
        <div className="border-t border-border pt-3">
          {hayDescuento && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Precio de lista</span>
              <span className="line-through decoration-muted-foreground/60">
                {formatCurrency(totalSinDescuento)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span
              className={`text-2xl font-bold ${hayDescuento ? "text-success" : "text-foreground"}`}
            >
              {formatCurrency(totalFinal)}
            </span>
          </div>
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
