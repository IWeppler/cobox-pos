"use client";

import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import type { CandidatoMaestro } from "../lib/maestro-prefill";

interface CargaRapidaMaestroPickerProps {
  candidatos: CandidatoMaestro[] | null;
  /** Lo que tipeó el empleado, para que entienda de dónde salieron. */
  query: string;
  /** id_master del candidato que se está resolviendo tras el click. */
  resolviendoId: string | null;
  onElegir: (candidato: CandidatoMaestro) => void;
  /** Sigue al alta manual, ignorando las sugerencias. */
  onCargarManual: () => void;
}

export function CargaRapidaMaestroPicker({
  candidatos,
  query,
  resolviendoId,
  onElegir,
  onCargarManual,
}: Readonly<CargaRapidaMaestroPickerProps>) {
  const isOpen = candidatos !== null && candidatos.length > 0;
  const resolviendo = resolviendoId !== null;

  return (
    <Dialog
      open={isOpen}
      // Cerrar por Escape o click afuera equivale a "ninguno de estos": se
      // sigue al alta manual en vez de perder lo que el empleado tipeó.
      onOpenChange={(open) => !open && !resolviendo && onCargarManual()}
    >
      {isOpen ? (
        <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-card border-border">
          <DialogHeader className="p-5 pb-3 border-b border-border bg-muted/20">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="w-5 h-5 text-primary" />
              Encontrado en el Catálogo Maestro
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Buscando &ldquo;{query}&rdquo;. Elegí el producto correcto y se
              precargan marca, modelo y especificaciones.
            </p>
          </DialogHeader>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {candidatos?.map((candidato) => {
              const esteResolviendo = resolviendoId === candidato.idMaster;
              return (
                <button
                  key={candidato.idMaster}
                  type="button"
                  disabled={resolviendo}
                  onClick={() => onElegir(candidato)}
                  className="w-full flex items-start justify-between gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-foreground">
                      {candidato.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5 truncate">
                      {[candidato.marca, candidato.modelo]
                        .filter(Boolean)
                        .join(" · ")}
                      {candidato.ean ? ` · EAN ${candidato.ean}` : ""}
                    </span>
                  </div>
                  {esteResolviendo ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5 text-muted-foreground" />
                  ) : (
                    <span
                      title={`Coincidencia ${Math.round(candidato.score * 100)}%`}
                      className="text-[10px] font-medium shrink-0 mt-0.5 px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-500/20"
                    >
                      {Math.round(candidato.score * 100)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Salida siempre visible: el maestro sugiere, no obliga. Si ninguno
              es el producto, el alta manual de siempre sigue a un click. */}
          <div className="p-3 border-t border-border bg-muted/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={resolviendo}
              onClick={onCargarManual}
              className="w-full text-xs text-muted-foreground"
            >
              Ninguno — cargarlo a mano
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
