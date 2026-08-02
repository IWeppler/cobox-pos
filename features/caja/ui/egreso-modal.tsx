"use client";

import { useState, useActionState } from "react";
import { registrarEgresoAction } from "../actions/caja-action";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { TrendingDown, Loader2 } from "lucide-react";

export function EgresoModal() {
  const [isOpen, setIsOpen] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const result = await registrarEgresoAction(prevState, formData);
      if (result.success) {
        toast.success("Gasto registrado correctamente");
        setIsOpen(false);
      } else {
        toast.error(result.error || "Ocurrió un error");
      }
      return result;
    },
    { error: null, success: false },
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
        >
          <TrendingDown className="w-4 h-4 mr-2" />
          Anotar Gasto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Egreso</DialogTitle>
          <DialogDescription>
            Anota los gastos del local (envíos, insumos, limpieza) para que se
            descuenten de tu ganancia neta.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="concepto">Concepto / Motivo</Label>
            <Input
              id="concepto"
              name="concepto"
              placeholder="Ej: Flete de mercadería, Bolsas..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="monto">Monto gastado</Label>
            <Input
              id="monto"
              name="monto"
              type="number"
              min="1"
              step="any"
              placeholder="Ej: 2500"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
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
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Egreso
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
