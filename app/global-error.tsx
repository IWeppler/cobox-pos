"use client";

import { useEffect } from "react";
import { reportarErrorCliente } from "@/shared/lib/reportar-error-cliente";

/**
 * Último recurso: se muestra cuando revienta el layout raíz, que es el único
 * caso que el error boundary por defecto de Next no puede cubrir. Reemplaza
 * el <html> entero, así que no puede usar los estilos ni los providers de la
 * app — de ahí los estilos inline.
 *
 * Hasta ahora la app no tenía NINGÚN error boundary propio: un error de
 * render dejaba la pantalla en blanco y no se reportaba a ningún lado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportarErrorCliente({
      tipo: "react-error-boundary",
      mensaje: error.message,
      stack: error.stack,
      detalle: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            Algo salió mal
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#a1a1aa",
            }}
          >
            La aplicación se cortó inesperadamente. Ya quedó registrado para
            revisarlo. Podés reintentar sin perder la sesión.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#fafafa",
              color: "#09090b",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.75rem",
                color: "#52525b",
              }}
            >
              Código: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
