"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Loader2,
  Calculator,
  AlertTriangle,
  UserX,
  CheckCircle2,
  CreditCard,
  BookUser,
} from "lucide-react";
import { ClienteBasico } from "./client-selector";

interface PaymentModalProps {
  totalFinal: number;
  sumaPagos: number;
  isPending: boolean;
  clienteSeleccionado: ClienteBasico | null;
  isCuentaCorriente: boolean;
  anticipoMinimo: number;
  isEfectivoOnly: boolean;
  onConfirm: (montoAnticipo?: number) => void;
  onClose: () => void;
}

export function PaymentModal({
  totalFinal,
  sumaPagos,
  isPending,
  clienteSeleccionado,
  isCuentaCorriente,
  anticipoMinimo,
  isEfectivoOnly,
  onConfirm,
  onClose,
}: Readonly<PaymentModalProps>) {
  const [montoRecibido, setMontoRecibido] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [anticipoLocal, setAnticipoLocal] = useState<string>(
    anticipoMinimo.toString(),
  );
  const anticipoLocalNum = Number(anticipoLocal) || 0;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // 1. LÓGICA DE VENTA NORMAL (Al Contado)
  if (!isCuentaCorriente) {
    const isSobrePagoError = sumaPagos > totalFinal + 0.05;
    const recibidoNum = Number(montoRecibido) || 0;
    const vuelto = recibidoNum > totalFinal ? recibidoNum - totalFinal : 0;

    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[400px] bg-card p-6 rounded-2xl border-border shadow-xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {isEfectivoOnly ? (
                <Calculator className="w-5 h-5 text-primary" />
              ) : (
                <CreditCard className="w-5 h-5 text-primary" />
              )}
              {isEfectivoOnly ? "Calculadora de Vuelto" : "Confirmar Cobro"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirmación de cobro normal.
            </DialogDescription>
          </DialogHeader>

          {isSobrePagoError ? (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 text-sm leading-relaxed">
              Has asignado <strong>${sumaPagos.toLocaleString("es-AR")}</strong>
              , superando el total del ticket de{" "}
              <strong>${totalFinal.toLocaleString("es-AR")}</strong>. Revisa los
              pagos para no descuadrar la caja.
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in zoom-in-95">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Monto a cobrar</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    value={totalFinal.toLocaleString("es-AR")}
                    readOnly
                    disabled
                    className="pl-8 font-medium h-11 text-lg text-foreground"
                  />
                </div>
              </div>

              {isEfectivoOnly ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      ¿Con cuánto billete físico paga?
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        ref={inputRef}
                        type="number"
                        min="0"
                        step="any"
                        value={montoRecibido}
                        onChange={(e) => setMontoRecibido(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && !isPending && onConfirm()
                        }
                        placeholder="Ej: 5000"
                        className="pl-8 font-medium h-11"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between pt-2 pb-2 font-semibold text-xl text-foreground border-t border-border mt-4">
                    <span className="text-sm self-center">
                      Valor a devolver
                    </span>
                    <span>$ {vuelto.toLocaleString("es-AR")}</span>
                  </div>
                </>
              ) : (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-blue-800 text-sm">
                  Procesa el cobro en tu terminal o cuenta digital y presiona
                  confirmar para asentar la venta.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-4 mt-2">
            <Button
              onClick={() => onConfirm()}
              disabled={isPending || isSobrePagoError}
              className="w-full"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                "Confirmar Venta"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // 2. 🚀 LÓGICA DE CUENTA CORRIENTE INTERACTIVA (Calculadora Fiado)
  const isAnticipoInsuficiente = anticipoLocalNum < anticipoMinimo - 0.05;
  const deudaGenerada = totalFinal - anticipoLocalNum;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] bg-card p-6 rounded-2xl border-border shadow-xl">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookUser className="w-5 h-5 text-amber-600" />
            Resumen de Fiado
          </DialogTitle>
          <DialogDescription className="sr-only">
            Aprobación de venta a cuenta corriente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 animate-in fade-in zoom-in-95">
          <div className="flex justify-between items-center text-sm font-semibold mb-2">
            <span className="text-foreground">Total de la venta:</span>
            <span className="text-lg">
              ${totalFinal.toLocaleString("es-AR")}
            </span>
          </div>

          {/* 🚀 EL INPUT INTERACTIVO AHORA VIVE AQUÍ */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">
              ¿Cuánto deja de anticipo hoy?
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground font-semibold">
                $
              </span>
              <Input
                ref={inputRef}
                type="number"
                min="0"
                step="any"
                value={anticipoLocal}
                onChange={(e) => setAnticipoLocal(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  !isPending &&
                  !isAnticipoInsuficiente &&
                  clienteSeleccionado &&
                  onConfirm(anticipoLocalNum)
                }
                className="pl-8 h-12 text-lg font-semibold border-border text-foreground"
                placeholder="0"
              />
            </div>
          </div>

          <div className="p-4 mt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground font-medium">
                Saldo a deber
              </p>
              <p className="text-2xl font-semibold">
                ${Math.max(0, deudaGenerada).toLocaleString("es-AR")}
              </p>
            </div>

            {/* Advertencia suave si entrega poco dinero */}
            {isAnticipoInsuficiente && anticipoLocalNum >= 0 && (
              <div className="mt-3 pt-3 border-t border-border flex items-start gap-2 text-amber-800 dark:text-accent-orange text-xs font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p>
                  El cliente está dejando un anticipo menor al mínimo sugerido
                  de ${anticipoMinimo.toLocaleString("es-AR")}.
                </p>
              </div>
            )}
          </div>

          {!clienteSeleccionado ? (
            <div className="flex items-center gap-3 text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-200">
              <UserX className="w-6 h-6 shrink-0" />
              <p className="text-xs font-semibold leading-tight">
                Debes seleccionar un cliente en el paso anterior para poder
                registrarle la deuda.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-emerald-800 bg-emerald-50 dark:bg-emerald-300/20 p-3 rounded-lg border border-emerald-300">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <p className="text-xs font-medium leading-tight">
                La deuda se registrará en la cuenta de{" "}
                <strong>{clienteSeleccionado.nombre}</strong>.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 mt-2">
          <Button
            onClick={() => onConfirm(anticipoLocalNum)}
            disabled={isPending || !clienteSeleccionado || deudaGenerada < 0}
            className="bg-accent-orange hover:bg-accent-orange/80 text-white h-12 w-full"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              "Confirmar y Fiar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
