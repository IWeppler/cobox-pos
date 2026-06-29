"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Loader2, DollarSign, Wallet } from "lucide-react";
import { toast } from "sonner";
import { registrarPagoDeudaAction } from "../actions/manage-clients";
import { Cliente } from "@/entities/clientes/type";
import { MetodoPago } from "@/entities/payments/types";

export function RegisterPaymentModal({
  cliente,
  metodosPago,
}: {
  cliente: Cliente;
  metodosPago: MetodoPago[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);

    startTransition(async () => {
      const result = await registrarPagoDeudaAction(null, formData);
      if (result.success) {
        toast.success(
          "Pago registrado exitosamente. La deuda se ha actualizado.",
        );
        setIsOpen(false);
      } else {
        toast.error(result.error || "Ocurrió un error.");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/80 text-white">
          <DollarSign className="w-4 h-4 mr-1.5" /> Registrar Cobro
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-100 bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Asentar pago a cuenta
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <input type="hidden" name="cliente_id" value={cliente.id} />

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Monto que entrega
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                $
              </span>
              <Input
                name="monto"
                type="number"
                min="1"
                max={cliente.saldo_pendiente}
                step="any"
                placeholder={cliente.saldo_pendiente.toString()}
                defaultValue={cliente.saldo_pendiente}
                required
                className="pl-8 h-12 text-lg font-bold shadow-none border-border"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Deuda total: $
              {Number(cliente.saldo_pendiente).toLocaleString("es-AR")}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              ¿Cómo te paga?
            </Label>
            <Select
              name="metodo_pago_id"
              required
              defaultValue={metodosPago[0]?.id}
            >
              <SelectTrigger className="h-12 border-border bg-card shadow-none font-semibold">
                <SelectValue placeholder="Seleccionar método..." />
              </SelectTrigger>
              <SelectContent>
                {metodosPago.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="font-medium">
                    {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Este dinero ingresará directamente en el arqueo de tu Caja de hoy.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-primary hover:bg-primary/80 text-white"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Confirmar Ingreso
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
