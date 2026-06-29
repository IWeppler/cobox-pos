"use client";

import { FormEvent, useTransition } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Cliente } from "@/entities/clientes/type";
import { ajustarSaldoAction } from "../actions/manage-clients";

interface AdjustClientBalanceModalProps {
  cliente: Cliente | null;
  onClose: () => void;
}

export function AdjustClientBalanceModal({
  cliente,
  onClose,
}: Readonly<AdjustClientBalanceModalProps>) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cliente) return;

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await ajustarSaldoAction(cliente.id, formData);
      if (result.success) {
        toast.success("Deuda cargada exitosamente.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open={!!cliente} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-accent-orange" /> Ajuste de
            Saldo
          </DialogTitle>
          <DialogDescription>
            Carga una deuda anterior o realiza un ajuste manual en el Ledger de{" "}
            <strong className="text-foreground">{cliente?.nombre}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="adjust-monto" className="text-xs font-bold">
              Monto de la deuda (ARS)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="adjust-monto"
                name="monto"
                type="number"
                min="0"
                step="any"
                required
                className="pl-8 h-10 shadow-none"
                placeholder="Ej: 15000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-descripcion" className="text-xs font-bold">
              Motivo del ajuste
            </Label>
            <Input
              id="adjust-descripcion"
              name="descripcion"
              required
              defaultValue="Saldo inicial pre-sistema"
              className="h-10 shadow-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-accent-orange text-white hover:bg-accent-orange/80"
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Registrar Deuda
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
