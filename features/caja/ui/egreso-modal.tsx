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
import { CajaActionState } from "@/entities/caja/types";

interface EgresoModalProps {
  /** Controlado desde afuera (el modal de caja lo abre sin trigger propio).
   * Sin esta prop el modal se maneja solo, como siempre. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** false cuando quien abre el modal es otro control (ver CajaStatusButton). */
  mostrarTrigger?: boolean;
  /** Estilo del trigger propio, para que el mismo modal sirva como acción
   * suelta de una barra o como botón ancho del panel en mobile. */
  triggerClassName?: string;
  triggerVariant?: "ghost" | "outline" | "secondary";
}

export function EgresoModal({
  open,
  onOpenChange,
  mostrarTrigger = true,
  triggerClassName,
  triggerVariant = "ghost",
}: Readonly<EgresoModalProps> = {}) {
  const [isOpenInterno, setIsOpenInterno] = useState(false);

  const esControlado = open !== undefined;
  const isOpen = esControlado ? open : isOpenInterno;
  const setIsOpen = (valor: boolean) => {
    if (!esControlado) setIsOpenInterno(valor);
    onOpenChange?.(valor);
  };

  const [, formAction, isPending] = useActionState(
    async (prevState: CajaActionState, formData: FormData) => {
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
      {mostrarTrigger && (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} className={triggerClassName}>
            <TrendingDown className="w-4 h-4 mr-2" />
            Anotar Gasto
          </Button>
        </DialogTrigger>
      )}
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
