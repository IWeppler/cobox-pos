"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Store } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  seleccionarNegocioAction,
  type MembresiaNegocio,
} from "@/features/auth/actions/negocios";

export function SelectorNegocio({
  negocios,
}: Readonly<{ negocios: MembresiaNegocio[] }>) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [elegido, setElegido] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegir = (negocioId: string) => {
    setElegido(negocioId);
    setError(null);
    startTransition(async () => {
      const res = await seleccionarNegocioAction(negocioId);
      if (!res.success) {
        setError(res.error);
        setElegido(null);
        return;
      }
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {negocios.map((negocio) => (
        <Button
          key={negocio.negocio_id}
          variant="outline"
          disabled={pendiente}
          onClick={() => elegir(negocio.negocio_id)}
          className="w-full h-auto justify-start gap-3 p-4"
        >
          {pendiente && elegido === negocio.negocio_id ? (
            <Loader2 className="size-5 animate-spin shrink-0" />
          ) : (
            <Store className="size-5 shrink-0" />
          )}
          <span className="flex flex-col items-start text-left">
            <span className="font-medium">{negocio.nombre}</span>
            <span className="text-xs text-muted-foreground">
              {negocio.es_owner ? "Dueño" : negocio.rol}
            </span>
          </span>
        </Button>
      ))}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
