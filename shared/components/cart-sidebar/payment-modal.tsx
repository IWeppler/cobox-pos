"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface PaymentModalProps {
  totalFinal: number;
  isPending: boolean;
  onConfirm: (montoPagado: number | null) => void;
  onClose: () => void;
}

export function PaymentModal({
  totalFinal,
  isPending,
  onConfirm,
  onClose,
}: Readonly<PaymentModalProps>) {
  const [montoPagado, setMontoPagado] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus al abrir
    const timeout = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    // Cerrar con Escape
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPending, onClose]);

  const montoNum =
    montoPagado === "" ? null : parseFloat(montoPagado.replace(",", "."));
  const montoInsuficiente = montoNum !== null && montoNum < totalFinal;
  const vuelto =
    montoNum !== null && !montoInsuficiente ? montoNum - totalFinal : null;

  const handleConfirm = () => {
    if (montoInsuficiente || isPending) return;
    onConfirm(montoNum);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm();
  };

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      {/* Panel */}
      <div className="w-full max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 space-y-5 shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cobrar venta
          </h2>
          {!isPending && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total a cobrar</span>
          <span className="text-2xl font-semibold text-foreground">
            ${totalFinal.toLocaleString("es-AR")}
          </span>
        </div>

        {/* Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            ¿Con cuánto paga?
          </label>
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            placeholder="Dejar vacío si paga exacto o con tarjeta"
            value={montoPagado}
            onChange={(e) => setMontoPagado(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            className={`w-full h-12 px-4 rounded-lg border bg-background text-foreground text-sm placeholder:text-muted-foreground/50 outline-none transition-colors disabled:opacity-50
              ${
                montoInsuficiente
                  ? "border-destructive focus:border-destructive"
                  : "border-border focus:border-foreground"
              }`}
          />
          {/* Feedback */}
          <div className="h-5 flex items-center">
            {montoInsuficiente && (
              <p className="text-md text-destructive font-medium">
                Monto insuficiente — faltan $
                {(totalFinal - (montoNum ?? 0)).toLocaleString("es-AR")}
              </p>
            )}
            {vuelto !== null && vuelto > 0 && (
              <p className="text-md text-muted-foreground">
                Vuelto:{" "}
                <span className="font-semibold text-foreground">
                  ${vuelto.toLocaleString("es-AR")}
                </span>
              </p>
            )}
            {vuelto === 0 && (
              <p className="text-md text-muted-foreground">Pago exacto ✓</p>
            )}
          </div>
        </div>

        {/* Botón confirmar */}
        <Button
          onClick={handleConfirm}
          disabled={isPending || montoInsuficiente}
          className="w-full h-12 flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 text-background transition-colors shadow-none disabled:opacity-40"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Venta
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
