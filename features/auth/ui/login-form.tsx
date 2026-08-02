"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { loginAction, type LoginState } from "../actions/login";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Button } from "@/shared/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const initialState: LoginState = { error: "", success: false };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  // Errores que llegan por URL: la sesión que quedó sin negocio (la corta el
  // middleware) y los enlaces de mail vencidos, que hasta ahora se descartaban
  // en silencio.
  const errorUrl = searchParams.get("error");
  const mensajeUrl =
    errorUrl === "sin-negocio"
      ? "Tu cuenta no está asociada a ningún negocio. Pedile a la persona a cargo que te invite."
      : errorUrl;

  useEffect(() => {
    if (state?.success) {
      // El destino lo decide el server según a cuántos negocios pertenece:
      // el POS, el selector de negocio o el alta del primero.
      router.push(state.destino ?? "/");
      router.refresh();
    }
  }, [state?.success, state?.destino, router]);

  const isRedirecting = state?.success ?? false;
  const isLoading = isPending || isRedirecting;

  return (
    <form action={formAction} className="space-y-6" aria-busy={isLoading}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo Electrónico</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={isLoading}
            placeholder="correo@ejemplo.com"
            className="h-11 shadow-none bg-background"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link
              href="/recuperar"
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              disabled={isLoading}
              placeholder="••••••••"
              className="h-11 shadow-none bg-background pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {(state?.error || mensajeUrl) && (
        <div
          role="alert"
          aria-live="polite"
          className="text-sm text-destructive font-medium"
        >
          {state?.error || mensajeUrl}
        </div>
      )}

      <Button type="submit" disabled={isLoading} className="w-full h-12">
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {isRedirecting ? "Redirigiendo..." : "Ingresando..."}
          </>
        ) : (
          "Ingresar"
        )}
      </Button>
    </form>
  );
}
