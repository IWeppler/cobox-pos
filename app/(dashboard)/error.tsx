"use client";

import { useEffect } from "react";
import { RefreshCw, WifiOff, TriangleAlert } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { esErrorDeRed } from "@/shared/lib/error-de-red";
import { reportarErrorCliente } from "@/shared/lib/reportar-error-cliente";

/**
 * Error boundary del panel.
 *
 * POR QUÉ EXISTE: hasta acá el ÚNICO boundary de la app era
 * `app/global-error.tsx`, que por definición de Next reemplaza el `<html>`
 * entero. O sea que cualquier error —incluido un parpadeo de señal— dejaba la
 * pantalla negra con "la aplicación se cortó inesperadamente", perdiendo el
 * sidebar, el negocio activo y el formulario que se estaba llenando.
 *
 * Caso real (Evens, 20/8): la dueña subía una foto desde el celular, el POST
 * de la Server Action se moría en la red y la app entera se ponía en negro. No
 * se había roto nada.
 *
 * Este boundary corre DENTRO del layout del panel: el sidebar y la sesión
 * siguen ahí y `reset()` vuelve a montar solo la pantalla que falló.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const esDeRed = esErrorDeRed(error);

  useEffect(() => {
    reportarErrorCliente({
      tipo: "react-error-boundary",
      mensaje: error.message,
      stack: error.stack,
      // `esDeRed` va al log para poder separar los cortes de conexión de los
      // crasheos de verdad. Sin esa marca, un día de mala señal parece una
      // app inestable y esconde los errores que sí hay que arreglar.
      detalle: { digest: error.digest, esDeRed, alcance: "dashboard" },
    });
  }, [error, esDeRed]);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {esDeRed ? (
            <WifiOff className="h-6 w-6 text-muted-foreground" />
          ) : (
            <TriangleAlert className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <h2 className="text-lg font-semibold text-foreground">
          {esDeRed ? "Se cortó la conexión" : "Esta pantalla falló"}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {esDeRed ? (
            <>
              No se pudo hablar con el servidor. No cerraste sesión y no perdiste
              nada: revisá la señal y tocá Reintentar.
            </>
          ) : (
            <>
              Quedó registrado para revisarlo. Podés reintentar sin cerrar
              sesión; si sigue fallando, probá desde otra pantalla.
            </>
          )}
        </p>

        <Button onClick={() => reset()} className="mt-6" size="sm">
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>

        {/* Solo en errores reales: en un corte de red el digest no identifica
            nada del lado del servidor, porque el request nunca llegó. */}
        {!esDeRed && error.digest && (
          <p className="mt-4 font-mono text-xs text-muted-foreground/70">
            Código: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
