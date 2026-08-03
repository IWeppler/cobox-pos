"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { Download, Sparkles } from "lucide-react";
import { useInstalacionPwa } from "@/shared/lib/use-instalacion-pwa";
import { InstruccionesInstalacion } from "./instrucciones-instalacion";

export function InstallAppWidget({
  isCollapsed,
}: Readonly<{ isCollapsed: boolean }>) {
  const { metodo, instalar } = useInstalacionPwa();
  const [instruccionesAbiertas, setInstruccionesAbiertas] = useState(false);

  // `metodo` es null hasta que monta: la detección necesita el navegador.
  if (!metodo) return null;
  if (metodo.tipo === "instalada" || metodo.tipo === "no-disponible") {
    return null;
  }

  // En iOS no hay prompt nativo, así que el botón abre las instrucciones. Es
  // el caso que antes no mostraba nada: el widget colgaba de un evento que
  // Safari no dispara nunca.
  const alTocar = () => {
    if (metodo.tipo === "prompt") {
      void instalar();
      return;
    }
    setInstruccionesAbiertas(true);
  };

  const titulo =
    metodo.tipo === "abrir-en-navegador" ? "Abrir para instalar" : "Instalar Comerz";
  const detalle =
    metodo.tipo === "abrir-en-navegador"
      ? "Abrila en el navegador para poder instalarla."
      : "Obtené la experiencia de pantalla completa y mayor velocidad.";
  const textoBoton =
    metodo.tipo === "prompt" ? "Instalar ahora" : "Ver cómo se instala";

  return (
    <>
      <div
        className={`transition-all duration-300 ${isCollapsed ? "" : "bg-linear-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-3 shadow-sm"}`}
      >
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={alTocar}
                className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 hover:bg-indigo-200 transition-colors"
              >
                <Download className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{titulo}</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-white dark:bg-indigo-900 flex items-center justify-center shadow-sm shrink-0 border border-indigo-50 dark:border-indigo-800">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="leading-tight">
                <p className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 font-semibold uppercase tracking-wider">
                  App Nativa
                </p>
                <p className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                  {titulo}
                </p>
              </div>
            </div>
            <p className="text-xs text-indigo-900/70 dark:text-indigo-200/70 mb-3 leading-snug">
              {detalle}
            </p>
            <button
              onClick={alTocar}
              className="w-full flex items-center justify-center gap-2 bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white border border-indigo-200 dark:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500 rounded-lg py-1.5 text-sm font-bold transition-colors shadow-sm active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              {textoBoton}
            </button>
          </>
        )}
      </div>

      <InstruccionesInstalacion
        metodo={metodo}
        abierto={instruccionesAbiertas}
        onAbiertoChange={setInstruccionesAbiertas}
      />
    </>
  );
}
