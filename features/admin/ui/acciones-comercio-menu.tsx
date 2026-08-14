"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Ban, Link2, Play, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  cambiarEstadoNegocioAction,
  cambiarPlanAction,
  cambiarSlugAction,
} from "@/features/admin/actions/acciones-comercio";
import { RegistrarPagoModal } from "./registrar-pago-modal";
import { HistorialPagosModal } from "./historial-pagos-modal";

export interface PlanOpcion {
  id: string;
  nombre: string;
  precio_mensual: number;
}

/**
 * Las acciones sobre un comercio, en un solo lugar.
 *
 * Suspender y dar de baja NO borran nada: el comercio deja de entrar y sus
 * datos quedan intactos, así que al pagar vuelve exactamente a donde estaba.
 * Perder el catálogo y las ventas de alguien por una cuota impaga sería un
 * daño irreversible por un problema temporal.
 */
export function AccionesComercioMenu({
  negocioId,
  nombre,
  slug,
  estado,
  planId,
  planes,
}: Readonly<{
  negocioId: string;
  nombre: string;
  slug: string;
  estado: string;
  planId: string | null;
  planes: PlanOpcion[];
}>) {
  const [pendiente, startTransition] = useTransition();
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);

  const correr = (fn: () => Promise<{ error: string | null; success: boolean }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.success) toast.success("Listo");
      else toast.error(res.error ?? "No se pudo.");
    });

  const pedirSlug = () => {
    // `prompt` y no un modal propio: es una acción de tres por año, hecha por
    // una sola persona que además es quien escribió el sistema.
    const nuevo = window.prompt(
      `Link de la tienda de ${nombre}.\n\nEl link viejo va a seguir funcionando y redirige al nuevo.`,
      slug,
    );
    if (!nuevo || nuevo === slug) return;
    correr(() => cambiarSlugAction(negocioId, nuevo));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Acciones de ${nombre}`}
            disabled={pendiente}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setPagoAbierto(true)}>
            <Wallet className="mr-2 size-4 text-success" />
            Registrar pago
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHistorialAbierto(true)}>
            <Receipt className="mr-2 size-4 text-muted-foreground" />
            Historial de pagos
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cambiar plan
          </div>
          {planes.map((plan) => (
            <DropdownMenuItem
              key={plan.id}
              disabled={plan.id === planId}
              onClick={() => correr(() => cambiarPlanAction(negocioId, plan.id))}
            >
              <span className={plan.id === planId ? "opacity-50" : ""}>
                {plan.nombre}
                {plan.id === planId ? " (actual)" : ""}
              </span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={pedirSlug}>
            <Link2 className="mr-2 size-4 text-muted-foreground" />
            Cambiar link de la tienda
          </DropdownMenuItem>

          {estado === "activo" ? (
            <>
              <DropdownMenuItem
                onClick={() =>
                  correr(() =>
                    cambiarEstadoNegocioAction(negocioId, "suspendido"),
                  )
                }
              >
                <Ban className="mr-2 size-4 text-warning" />
                Suspender (no paga)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() =>
                  correr(() => cambiarEstadoNegocioAction(negocioId, "baja"))
                }
              >
                <Ban className="mr-2 size-4" />
                Dar de baja
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onClick={() =>
                correr(() => cambiarEstadoNegocioAction(negocioId, "activo"))
              }
            >
              <Play className="mr-2 size-4 text-success" />
              Reactivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RegistrarPagoModal
        open={pagoAbierto}
        onOpenChange={setPagoAbierto}
        negocioId={negocioId}
        nombre={nombre}
        precioSugerido={planes.find((p) => p.id === planId)?.precio_mensual ?? 0}
      />

      <HistorialPagosModal
        open={historialAbierto}
        onOpenChange={setHistorialAbierto}
        negocioId={negocioId}
        nombre={nombre}
      />
    </>
  );
}
