"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { useCajaStatusStore } from "@/shared/store/caja-status-store";
import { CajaQuickModal } from "./caja-quick-modal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { formatearMoneda } from "@/shared/utils/formatters";

interface CajaStatusButtonProps {
  modoCaja: string;
  userId: string;
  className?: string;
}

/**
 * Estado de caja + acceso rápido a abrir/cerrar turno sin navegar a /caja.
 * Lee `isCajaAbierta` del store compartido (ver caja-status-store.ts) —
 * no dispara su propio fetch, Sidebar ya lo mantiene actualizado con el
 * polling de 60s + refetch inmediato al abrir/cerrar.
 */
export function CajaStatusButton({
  modoCaja,
  userId,
  className = "",
}: Readonly<CajaStatusButtonProps>) {
  const isCajaAbierta = useCajaStatusStore((state) => state.isCajaAbierta);
  const turno = useCajaStatusStore((state) => state.turno);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const boton = (
    <button
      type="button"
      onClick={() => setIsModalOpen(true)}
      aria-label={
        isCajaAbierta
          ? `Caja abierta — efectivo esperado ${formatearMoneda(turno?.montoActual ?? 0)}`
          : "Abrir turno"
      }
      className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors ${
        isCajaAbierta
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
      } ${className}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          isCajaAbierta ? "bg-emerald-500" : "bg-muted-foreground/40"
        }`}
      />
      <Wallet className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden sm:inline">
        {isCajaAbierta === null
          ? "Caja"
          : isCajaAbierta
            ? "Caja abierta"
            : "Caja cerrada"}
      </span>
    </button>
  );

  return (
    <>
      {isCajaAbierta && turno ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{boton}</TooltipTrigger>
            <TooltipContent side="bottom">
              Efectivo esperado: {formatearMoneda(turno.montoActual)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        boton
      )}

      <CajaQuickModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        modoCaja={modoCaja}
        userId={userId}
      />
    </>
  );
}
