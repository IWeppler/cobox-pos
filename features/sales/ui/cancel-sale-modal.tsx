"use client";

import { useState, useTransition } from "react";
import { anularVentaAction } from "../actions/cancel-sale";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { RotateCcw, AlertTriangle, PackagePlus, Loader2 } from "lucide-react";

interface AnularVentaModalProps {
  id: string;
  productoNombre: string;
  cantidad: number;
  variante: string;
  isProductoEliminado: boolean;
}

export function AnularVentaModal({
  id,
  productoNombre,
  cantidad,
  variante,
  isProductoEliminado,
}: Readonly<AnularVentaModalProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState<"RESTAURAR_STOCK" | "BAJA">(
    "RESTAURAR_STOCK",
  );

  const handleAnular = () => {
    startTransition(async () => {
      const result = await anularVentaAction(id, motivo);

      if (result.success) {
        setIsOpen(false);
        if (isProductoEliminado) {
          toast.success(
            "Venta anulada. El dinero se restó de la caja de hoy.",
            {
              description:
                "Stock no restaurado porque el producto fue eliminado del catálogo.",
            },
          );
        } else {
          toast.success("Venta anulada y dinero reintegrado a caja.", {
            description:
              motivo === "RESTAURAR_STOCK"
                ? `Se devolvieron ${cantidad}u al inventario.`
                : `Se registró como Baja (pérdida).`,
          });
        }
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-danger hover:text-danger h-8 w-8 sm:h-9 sm:w-9 cursor-pointer shrink-0"
          title="Anular Venta"
        >
          <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            Registrar Devolución
          </DialogTitle>
          <DialogDescription>
            Vas a anular la venta de{" "}
            <strong className="text-foreground">
              {cantidad}x {productoNombre} ({variante})
            </strong>
            . El dinero se restará automáticamente de la caja de hoy como un
            Egreso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {!isProductoEliminado && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">
                ¿Qué hacemos con el producto físico?
              </Label>
              <RadioGroup
                value={motivo}
                onValueChange={(v) => setMotivo(v as any)}
              >
                <div
                  className={`flex items-start space-x-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${motivo === "RESTAURAR_STOCK" ? "border-success bg-success/10" : "border-border"}`}
                  onClick={() => setMotivo("RESTAURAR_STOCK")}
                >
                  <RadioGroupItem
                    value="RESTAURAR_STOCK"
                    id="r1"
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="r1"
                      className="font-bold text-success cursor-pointer flex items-center gap-1.5"
                    >
                      <PackagePlus className="w-4 h-4" /> Devolver al inventario
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      El cliente se arrepintió. El producto está sano y se
                      sumará al inventario (+{cantidad}).
                    </p>
                  </div>
                </div>

                <div
                  className={`flex items-start space-x-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${motivo === "BAJA" ? "border-amber-500 bg-amber-50 dark:bg-amber-200/10" : "border-border"}`}
                  onClick={() => setMotivo("BAJA")}
                >
                  <RadioGroupItem value="BAJA" id="r2" className="mt-1" />
                  <div className="space-y-1">
                    <Label
                      htmlFor="r2"
                      className="font-bold text-warning cursor-pointer flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-4 h-4" /> Descartar
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      El producto se rompió. Se registrará como Baja y no
                      volverá al stock.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {isProductoEliminado && (
            <div className="bg-danger/10 border border-danger/20 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
              <p className="text-sm text-danger">
                El producto original fue eliminado del catálogo maestro. La
                devolución restará el dinero de la caja, pero no es posible
                restaurar el stock.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleAnular}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirmar Devolución
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
