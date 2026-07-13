"use client";

import type { FormEventHandler, FormHTMLAttributes, ReactNode } from "react";
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
import { Loader2, UserPlus } from "lucide-react";

interface CreateClientDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  action?: FormHTMLAttributes<HTMLFormElement>["action"];
  onSubmit?: FormEventHandler<HTMLFormElement>;
  isPending?: boolean;
  includeDni?: boolean;
}

export function CreateClientDialog({
  open,
  onOpenChange,
  trigger,
  action,
  onSubmit,
  isPending = false,
  includeDni = false,
}: Readonly<CreateClientDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent className="sm:max-w-100 border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Nuevo Cliente
          </DialogTitle>
        </DialogHeader>

        <form action={action} onSubmit={onSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="nombre" className="text-sm font-medium">
              Nombre Completo <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="nombre"
              name="nombre"
              placeholder="Ej: Juan Perez"
              required
              className="h-11 shadow-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp" className="text-sm font-medium">
              Telefono / WhatsApp <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              placeholder="Ej: 3491 1234-56"
              required
              className="h-11 shadow-none"
            />
          </div>

          {includeDni ? (
            <div className="space-y-2">
              <Label htmlFor="dni" className="text-sm font-medium">
                DNI / CUIT
              </Label>
              <Input
                id="dni"
                name="dni"
                placeholder="Opcional"
                className="h-11 shadow-none"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="notas" className="text-sm font-medium">
              Notas (Opcional)
            </Label>
            <Input
              id="notas"
              name="notas"
              placeholder="Ej: Vecino del local, revendedor..."
              className="h-11 shadow-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-primary text-white hover:bg-primary/80"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Guardar Cliente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
