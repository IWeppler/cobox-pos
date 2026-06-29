"use client";

import { useActionState, useState } from "react";
import { Button } from "@/shared/ui/button";
import { CreateClientDialog } from "@/features/clients/ui/create-client-dialog";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { crearClienteAction } from "../actions/manage-clients";

type CreateClientState = {
  error: string | null;
  success: boolean;
};

export function CreateClientModal() {
  const [isOpen, setIsOpen] = useState(false);

  const [, formAction, isPending] = useActionState(
    async (prevState: CreateClientState, formData: FormData) => {
      const result = await crearClienteAction(prevState, formData);
      if (result.success) {
        toast.success("Cliente registrado con exito.");
        setIsOpen(false);
      } else {
        toast.error(result.error || "Ocurrio un error");
      }
      return result;
    },
    { error: null, success: false },
  );

  return (
    <CreateClientDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      action={formAction}
      isPending={isPending}
      includeDni
      trigger={
        <Button title="Nuevo Cliente">
          <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden md:flex">Nuevo Cliente</span>
        </Button>
      }
    />
  );
}
