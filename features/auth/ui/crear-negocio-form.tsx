"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { crearNegocioAction } from "@/features/auth/actions/negocios";

const initialState = { error: null as string | null, success: false };

export interface PlanElegible {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_mensual: number | null;
}

export function CrearNegocioForm({
  planes,
}: Readonly<{ planes: PlanElegible[] }>) {
  const [state, formAction, isPending] = useActionState(
    crearNegocioAction,
    initialState,
  );
  // Preseleccionado el primero (el de entrada). Sin selección por defecto, el
  // formulario se puede mandar sin plan y el error llega después de tipear
  // todo — y un negocio sin plan es un negocio sin reglas.
  const [planId, setPlanId] = useState(planes[0]?.id ?? "");
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

      <fieldset className="space-y-2" disabled={isLoading}>
        <legend className="text-sm font-medium mb-2">Elegí tu plan</legend>
        {/* El plan viaja en un input oculto y no en un <select>: las tarjetas
            muestran precio y descripción, que es lo que hace falta para elegir.
            Se puede cambiar después desde el panel. */}
        <input type="hidden" name="plan_id" value={planId} />
        <div className="grid gap-2">
          {planes.map((plan) => {
            const elegido = plan.id === planId;
            return (
              <button
                type="button"
                key={plan.id}
                onClick={() => setPlanId(plan.id)}
                aria-pressed={elegido}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  elegido
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{plan.nombre}</span>
                  <span className="text-sm text-muted-foreground">
                    {plan.precio_mensual
                      ? `$${plan.precio_mensual.toLocaleString("es-AR")}/mes`
                      : "—"}
                  </span>
                </div>
                {plan.descripcion ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.descripcion}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Empezás con <strong>14 días de prueba</strong>. No se te cobra nada
          ahora y podés cambiar de plan cuando quieras.
        </p>
      </fieldset>

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
