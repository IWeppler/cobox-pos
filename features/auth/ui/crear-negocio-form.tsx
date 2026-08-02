"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { crearNegocioAction } from "@/features/auth/actions/negocios";

const initialState = { error: null as string | null, success: false };

export function CrearNegocioForm() {
  const [state, formAction, isPending] = useActionState(
    crearNegocioAction,
    initialState,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.push("/");
      router.refresh();
    }
  }, [state.success, router]);

  const isLoading = isPending || state.success;

  return (
    <form action={formAction} className="space-y-4" aria-busy={isLoading}>
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre del negocio</Label>
        <Input
          id="nombre"
          name="nombre"
          required
          disabled={isLoading}
          placeholder="Evens Indumentaria"
          className="h-11 shadow-none bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">WhatsApp de contacto</Label>
        <Input
          id="whatsapp"
          name="whatsapp"
          disabled={isLoading}
          placeholder="3492 000000"
          className="h-11 shadow-none bg-background"
        />
        <p className="text-xs text-muted-foreground">
          Es el número que ven los clientes en el catálogo. Se puede cambiar
          después.
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={isLoading} className="w-full h-11">
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Crear negocio"}
      </Button>
    </form>
  );
}
