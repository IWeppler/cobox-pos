"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import {
  registrarseAction,
  type RegistroState,
} from "@/features/auth/actions/registro";

const initialState: RegistroState = { error: "" };

/**
 * Alta de cuenta. Primer paso del onboarding self-service.
 *
 * Solo crea la cuenta; el negocio (y la elección de plan) es el paso siguiente
 * en /crear-negocio. Van separados porque son dos decisiones distintas y meter
 * las dos en un formulario hace que se abandone en la mitad.
 */
export function RegistroForm({ onVolver }: Readonly<{ onVolver: () => void }>) {
  const [state, formAction, isPending] = useActionState(
    registrarseAction,
    initialState,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success && state.destino) {
      router.push(state.destino);
      router.refresh();
    }
  }, [state.success, state.destino, router]);

  const cargando = isPending || Boolean(state.destino);

  // Confirmación por email prendida: no hay sesión todavía, así que no se
  // navega a ningún lado. Se le dice qué pasó y qué tiene que hacer, en vez de
  // dejar el formulario como si no hubiera pasado nada.
  if (state.aviso) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p>{state.aviso}</p>
        <button
          type="button"
          onClick={onVolver}
          className="mt-3 font-semibold text-primary underline-offset-4 hover:underline"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" aria-busy={cargando}>
      <div className="space-y-2">
        <Label htmlFor="nombre-registro">Tu nombre</Label>
        <Input
          id="nombre-registro"
          name="nombre"
          required
          autoComplete="name"
          disabled={cargando}
          className="h-11 shadow-none bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email-registro">Email</Label>
        <Input
          id="email-registro"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={cargando}
          className="h-11 shadow-none bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password-registro">Contraseña</Label>
        <Input
          id="password-registro"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          disabled={cargando}
          className="h-11 shadow-none bg-background"
        />
        <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={cargando} className="w-full h-11">
        {cargando ? <Loader2 className="size-4 animate-spin" /> : "Crear cuenta"}
      </Button>
    </form>
  );
}
