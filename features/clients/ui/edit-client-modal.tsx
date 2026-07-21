"use client";

import { FormEvent, useTransition } from "react";
import { Edit2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { DatePickerAR } from "@/shared/components/date-picker-ar";
import { Cliente } from "@/entities/clientes/type";
import { editClienteAction } from "../actions/manage-clients";

interface EditClientModalProps {
  cliente: Cliente | null;
  onClose: () => void;
  entregaMinimaActiva?: boolean;
}

export function EditClientModal({
  cliente,
  onClose,
  entregaMinimaActiva = false,
}: Readonly<EditClientModalProps>) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cliente) return;

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await editClienteAction(cliente.id, formData);
      if (result.success) {
        toast.success("Cliente actualizado correctamente.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open={!!cliente} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-blue-600" /> Editar Cliente
          </DialogTitle>
        </DialogHeader>

        {cliente ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-nombre" className="text-xs font-bold">
                Nombre Completo
              </Label>
              <Input
                id="edit-nombre"
                name="nombre"
                defaultValue={cliente.nombre}
                required
                className="h-10 shadow-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-telefono" className="text-xs font-bold">
                  WhatsApp
                </Label>
                <Input
                  id="edit-telefono"
                  name="telefono"
                  defaultValue={cliente.telefono}
                  className="h-10 shadow-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dni" className="text-xs font-bold">
                  DNI
                </Label>
                <Input
                  id="edit-dni"
                  name="dni"
                  defaultValue={cliente.dni || ""}
                  className="h-10 shadow-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="edit-fecha-vencimiento-deuda"
                className="text-xs font-bold"
              >
                Fecha de vencimiento de deuda (Opcional)
              </Label>
              <DatePickerAR
                id="edit-fecha-vencimiento-deuda"
                name="fecha_vencimiento_deuda"
                defaultValue={cliente.fecha_vencimiento_deuda}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-xs font-bold">
                Correo (Opcional)
              </Label>
              <Input
                id="edit-email"
                name="email"
                defaultValue={cliente.email || ""}
                type="email"
                className="h-10 shadow-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notas" className="text-xs font-bold">
                Notas internas
              </Label>
              <Textarea
                id="edit-notas"
                name="notas"
                defaultValue={cliente.notas || ""}
                className="shadow-none resize-none h-20"
              />
            </div>

            {entregaMinimaActiva ? (
              <div className="flex items-start gap-2">
                <input
                  type="hidden"
                  name="exceptuado_entrega_minima_editable"
                  value="1"
                />
                <input
                  type="checkbox"
                  id="edit-exceptuado-entrega-minima"
                  name="exceptuado_entrega_minima"
                  defaultChecked={cliente.exceptuado_entrega_minima}
                  className="w-4 h-4 mt-0.5 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                />
                <Label
                  htmlFor="edit-exceptuado-entrega-minima"
                  className="text-sm font-normal text-muted-foreground cursor-pointer"
                >
                  Exceptuado de entrega mínima en cuenta corriente
                </Label>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Guardar Cambios
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
