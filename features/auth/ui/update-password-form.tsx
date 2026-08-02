"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import {
  resetPasswordFinalAction,
  type UpdatePasswordState,
} from "../actions/reset-password-final";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { useRouter, useSearchParams } from "next/navigation";

const initialState: UpdatePasswordState = { error: "", success: false };

export function UpdatePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    resetPasswordFinalAction,
    initialState,
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  // Si llegó desde un mail de invitación, el token viaja en la URL y se manda
  // junto con la contraseña: recién ahí entra al negocio.
  const invitacion = searchParams.get("invitacion");

  useEffect(() => {
    if (state?.success) {
      // Damos 2 segundos para que lea el mensaje de éxito antes de mandarlo al panel
      const timer = setTimeout(() => {
        router.push(state.destino ?? "/");
        router.refresh();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state?.success, state?.destino, router]);

  if (state?.success) {
    return (
      <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-bold tracking-tight text-foreground">
          {state.destino ? "¡Listo, ya podés entrar!" : "¡Contraseña actualizada!"}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed px-4">
          {state.destino
            ? "Tu cuenta quedó lista y ya tenés acceso al negocio. Llevándote a la terminal de venta..."
            : "Tu cuenta ahora está segura. Redirigiendo al panel principal..."}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6" aria-busy={isPending}>
      {invitacion ? (
        <input type="hidden" name="invitacion" value={invitacion} />
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              disabled={isPending}
              placeholder="••••••••"
              className="h-11 shadow-none bg-background pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isPending}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm_password">Repetir nueva contraseña</Label>
          <Input
            id="confirm_password"
            name="confirm_password"
            type={showPassword ? "text" : "password"}
            required
            disabled={isPending}
            placeholder="••••••••"
            className="h-11 shadow-none bg-background"
          />
        </div>
      </div>

      {state?.error && (
        <div className="p-3 text-sm text-destructive font-medium bg-destructive/10 rounded-md border border-destructive/20">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-full h-12">
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Actualizando...
          </>
        ) : (
          "Guardar nueva contraseña"
        )}
      </Button>
    </form>
  );
}