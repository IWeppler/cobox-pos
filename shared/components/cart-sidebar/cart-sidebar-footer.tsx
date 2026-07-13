"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PaymentModal } from "./payment-modal";
import { ClienteBasico } from "./client-selector";
import Link from "next/link";
import { MetodoPagoPOS } from "./types";
import { CreateSalePaymentInput } from "@/entities/ventas/types";

interface DescuentoDetalle {
  monto: number;
  nombre: string;
}

interface CartSidebarFooterProps {
  isPOSMode: boolean;
  isPending: boolean;
  totalCarrito: number;
  recargoCuentaCorriente: number;
  totalFinal: number;
  sumaPagos: number;
  isCuentaCorriente: boolean;
  anticipoMinimo: number;
  clienteSeleccionado: ClienteBasico | null;
  descuentoDetalle: DescuentoDetalle;
  whatsappHref: string;
  metodosPagoDB: MetodoPagoPOS[];
  pagos: CreateSalePaymentInput[];
  modoMixto: boolean;
  onConfirmarVentaPOS: (montoAnticipo?: number) => void;
  onEnviarPedidoWhatsApp: () => void;
  onClearCart: () => void;
}

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function CartSidebarFooter({
  isPOSMode,
  isPending,
  totalCarrito,
  totalFinal,
  sumaPagos,
  recargoCuentaCorriente,
  clienteSeleccionado,
  descuentoDetalle,
  isCuentaCorriente,
  anticipoMinimo,
  whatsappHref,
  metodosPagoDB = [],
  pagos = [],
  modoMixto,
  onConfirmarVentaPOS,
  onEnviarPedidoWhatsApp,
  onClearCart,
}: Readonly<CartSidebarFooterProps>) {
  const [modalAbierto, setModalAbierto] = useState(false);

  const isEfectivoOnly =
    !modoMixto &&
    pagos?.length === 1 &&
    metodosPagoDB?.find((m) => m.id === pagos[0]?.metodoPagoId)?.tipo ===
      "EFECTIVO";

  const handleCobrar = () => setModalAbierto(true);

  const isMissingClient = isCuentaCorriente && !clienteSeleccionado;
  const isMissingAnticipo =
    isCuentaCorriente && sumaPagos + 0.05 < anticipoMinimo;
  const isPrimaryDisabled = isPending || isMissingClient || isMissingAnticipo;

  const handleConfirmar = (montoAnticipo?: number) => {
    setModalAbierto(false);
    onConfirmarVentaPOS(montoAnticipo);
  };

  return (
    <>
      <div className="shrink-0 border-t border-border bg-card p-5 z-10">
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(totalCarrito)}</span>
          </div>
          {descuentoDetalle.monto > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700 dark:text-emerald-400">
              <span>Promocion: {descuentoDetalle.nombre}</span>
              <span>-{formatCurrency(descuentoDetalle.monto)}</span>
            </div>
          ) : null}
          {recargoCuentaCorriente > 0 ? (
            <div className="flex items-center justify-between text-sm text-amber-700 dark:text-amber-500">
              <span>Recargo Cuenta Corriente</span>
              <span>+{formatCurrency(recargoCuentaCorriente)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Total Final
            </span>
            <span className="text-2xl font-bold text-foreground">
              {formatCurrency(totalFinal)}
            </span>
          </div>
        </div>

        {isPOSMode ? (
          <Button
            onClick={handleCobrar}
            disabled={isPrimaryDisabled}
            className="w-full h-12 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white transition-colors shadow-none cursor-pointer"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                {isCuentaCorriente ? "Confirmar Fiado" : "Confirmar Venta"}
              </>
            )}
          </Button>
        ) : (
          <Link
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onEnviarPedidoWhatsApp}
            className="w-full flex items-center justify-center gap-3 h-12 rounded-lg bg-[#25D366] hover:bg-[#1EBE57] text-white font-bold text-sm uppercase tracking-widest shadow-none cursor-pointer"
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

      {modalAbierto && (
        <PaymentModal
          totalFinal={totalFinal}
          sumaPagos={sumaPagos}
          isPending={isPending}
          clienteSeleccionado={clienteSeleccionado}
          isCuentaCorriente={isCuentaCorriente}
          anticipoMinimo={anticipoMinimo}
          isEfectivoOnly={isEfectivoOnly}
          onConfirm={handleConfirmar}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </>
  );
}
