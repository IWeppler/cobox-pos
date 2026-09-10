"use client";

import { useEffect } from "react";
import { reportarErrorCliente } from "@/shared/lib/reportar-error-cliente";
import { esAccionDeVersionVieja } from "@/shared/lib/accion-de-version-vieja";

/**
 * Error boundary del panel de Comerz.
 *
 * Existía `global-error.tsx`, pero ese reemplaza el `<html>` entero y solo
 * debería aparecer cuando revienta el layout raíz. Sin un boundary en este
 * segmento, CUALQUIER error de `/admincomerz` —incluido el de una pestaña
 * vieja llamando a un Server Action que ya no existe— llegaba hasta ahí:
 * pantalla negra, sin sidebar y sin contexto, para algo que se arregla
 * recargando.
 *
 * Acá el panel se cae solo él, y el mensaje dice qué hacer.
 */
export default function ErrorAdminComerz({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const esVersionVieja = esAccionDeVersionVieja(error);

  useEffect(() => {
    reportarErrorCliente({
      tipo: "react-error-boundary",
      mensaje: error.message,
      stack: error.stack,
      detalle: {
        digest: error.digest,
        alcance: "admincomerz",
        esVersionVieja,
      },
    });
  }, [error, esVersionVieja]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-lg font-semibold text-white/90">
          {esVersionVieja
            ? "Se actualizó la app"
            : "No se pudo cargar el panel"}
        </h1>
        <p className="text-sm text-white/50">
          {esVersionVieja
            ? "Tenías esta pestaña abierta desde antes del último deploy, así que el botón que tocaste apunta a una versión que ya no está. Recargá y listo — no se mandó nada."
            : "Quedó registrado para revisarlo. Podés reintentar sin perder la sesión."}
        </p>

        <div className="flex justify-center gap-2 pt-2">
          {/* Reintentar con el mismo bundle vuelve a mandar el ID viejo, así
              que con una pestaña vieja el único botón que sirve es recargar. */}
          {esVersionVieja ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Recargar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Reintentar
            </button>
          )}
        </div>

        {error.digest && (
          <p className="pt-2 text-xs text-white/30">Código: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
