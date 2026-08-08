"use client";

import { useEffect } from "react";
import { reportarErrorCliente } from "@/shared/lib/reportar-error-cliente";
import { tomarOperacionSinCerrar } from "@/shared/lib/breadcrumb-carga";

/**
 * Se monta una sola vez en el layout raíz. Hace dos cosas:
 *
 * 1. Engancha los errores de JS que hoy se perdían (nada los estaba
 *    escuchando): excepciones sueltas y promesas rechazadas sin catch.
 * 2. Al cargar, revisa si quedó una operación marcada como "en curso" de la
 *    sesión anterior. Si la hay, esa pestaña se murió a la mitad sin tirar
 *    excepción — el patrón del crash por memoria durante la compresión de
 *    imágenes. Es la única evidencia posible de un crash de renderer.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const pendiente = tomarOperacionSinCerrar();
    if (pendiente) {
      reportarErrorCliente({
        tipo: "posible-crash-renderer",
        mensaje: `La operación "${pendiente.nombre}" quedó sin terminar — la pestaña se cerró o el navegador la mató a la mitad.`,
        detalle: {
          ...pendiente.detalle,
          operacion: pendiente.nombre,
          duracionMs: Date.now() - pendiente.iniciadaEn,
        },
      });
    }

    const onError = (event: ErrorEvent) => {
      reportarErrorCliente({
        tipo: "error",
        mensaje: event.message || "Error sin mensaje",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        detalle: {
          archivo: event.filename,
          linea: event.lineno,
          columna: event.colno,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const motivo = event.reason;
      reportarErrorCliente({
        tipo: "unhandledrejection",
        mensaje:
          motivo instanceof Error
            ? motivo.message
            : String(motivo ?? "Rechazo sin motivo"),
        stack: motivo instanceof Error ? motivo.stack : undefined,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
