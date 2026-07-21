"use client";

import { useState, useTransition } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Edit2,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { CuentaCorrienteMovimiento } from "@/entities/clientes/type";
import { formatearFechaHora, formatearMoneda } from "@/shared/utils/formatters";
import { anularMovimientoManualAction } from "../actions/manage-clients";
import { EditMovimientoCCModal } from "./edit-movimiento-cc-modal";

interface MovimientoCCCardProps {
  mov: CuentaCorrienteMovimiento;
  isAdmin: boolean;
  onChanged: () => void;
}

export function MovimientoCCCard({
  mov,
  isAdmin,
  onChanged,
}: Readonly<MovimientoCCCardProps>) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAnularConfirmOpen, setIsAnularConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Discriminador real manual-vs-sistema: un movimiento generado por una
  // venta o un cobro siempre trae venta_id o pago_id seteado.
  const esManual = !mov.venta_id && !mov.pago_id;
  const puedeGestionar = isAdmin && esManual && !mov.anulado;

  const fechaMostrada = mov.fecha_origen
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(mov.fecha_origen))
    : formatearFechaHora(mov.creado_en);

  const handleAnular = () => {
    startTransition(async () => {
      const result = await anularMovimientoManualAction(mov.id);
      if (result.success) {
        toast.success("Movimiento anulado.");
        setIsAnularConfirmOpen(false);
        onChanged();
      } else {
        toast.error(result.error || "No se pudo anular el movimiento.");
      }
    });
  };

  return (
    <>
      <div
        className={`flex items-center justify-between p-3 bg-background border border-border rounded-lg ${
          mov.anulado ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2 rounded-full shrink-0 ${mov.tipo === "DEBITO" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}
          >
            {mov.tipo === "DEBITO" ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={`text-sm font-semibold text-foreground truncate ${mov.anulado ? "line-through" : ""}`}
              >
                {mov.descripcion ||
                  (mov.tipo === "DEBITO"
                    ? "Cargo por Compra"
                    : "Abono a Cuenta")}
              </p>
              {mov.anulado && (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground border-border text-[9px] uppercase font-bold tracking-wider shrink-0"
                >
                  Anulado
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {fechaMostrada}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`font-semibold ${
              mov.anulado
                ? "line-through text-muted-foreground"
                : mov.tipo === "DEBITO"
                  ? "text-rose-600"
                  : "text-emerald-600"
            }`}
          >
            {mov.tipo === "DEBITO" ? "+" : "-"}
            {formatearMoneda(Number(mov.monto))}
          </span>

          {puedeGestionar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label="Opciones del movimiento"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                  <Edit2 className="w-3.5 h-3.5 mr-2 text-blue-600" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setIsAnularConfirmOpen(true)}
                  className="text-destructive hover:bg-destructive/10 focus:text-destructive"
                >
                  <Ban className="w-3.5 h-3.5 mr-2" />
                  Anular
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {isEditOpen && (
        <EditMovimientoCCModal
          mov={mov}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => {
            setIsEditOpen(false);
            onChanged();
          }}
        />
      )}

      <AlertDialog
        open={isAnularConfirmOpen}
        onOpenChange={setIsAnularConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a anular {formatearMoneda(Number(mov.monto))} del{" "}
              {fechaMostrada}. Va a seguir visible en el historial marcado como
              anulado, pero deja de contar para el saldo y el vencimiento del
              cliente. Esta acción se puede revertir por soporte técnico, pero
              no desde acá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handleAnular}
              disabled={isPending}
            >
              {isPending ? "Anulando..." : "Anular"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
