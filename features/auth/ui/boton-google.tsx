"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { iniciarConGoogleAction } from "@/features/auth/actions/google";
import { GOOGLE_AUTH_HABILITADO } from "@/shared/lib/auth-google";

/**
 * "Continuar con Google".
 *
 * No se renderiza nada si el flag está apagado: no hay estado deshabilitado ni
 * "próximamente". Un botón que no anda es peor que ninguno.
 *
 * `window.location.href` y no `router.push`: el destino es Google, o sea otro
 * origen, y el router de Next solo navega adentro de la app.
 */
export function BotonGoogle({
  next,
  etiqueta = "Continuar con Google",
}: Readonly<{ next: string; etiqueta?: string }>) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState("");

  if (!GOOGLE_AUTH_HABILITADO) return null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={pendiente}
        className="h-12 w-full gap-2.5 font-medium"
        onClick={() => {
          setError("");
          startTransition(async () => {
            const res = await iniciarConGoogleAction(next);
            if (res.url) {
              window.location.href = res.url;
              return;
            }
            setError(res.error);
          });
        }}
      >
        {pendiente ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogoGoogle />
        )}
        {etiqueta}
      </Button>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** El logo oficial. Va inline y no como archivo: son 4 paths y evita un
 * request más en la pantalla que más rápido tiene que aparecer. */
function LogoGoogle() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Separador entre Google y el formulario de siempre. */
export function SeparadorAuth() {
  if (!GOOGLE_AUTH_HABILITADO) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">o</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
