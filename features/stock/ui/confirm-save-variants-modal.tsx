"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { formatearMoneda } from "@/shared/utils/formatters";

export type VarianteDiffRow = {
  key: string;
  atributosLabel: string;
  stockAntes: number;
  stockDespues: number | null;
  precioAntes: number | null;
  precioDespues: number | null;
  seVaAEliminar: boolean;
};

type ConfirmSaveVariantsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoadingDiff: boolean;
  filas: VarianteDiffRow[];
  isSubmitting: boolean;
  onConfirm: () => void;
};

type Direccion = "sube" | "baja" | "igual";

// null se trata como 0 a los fines de la comparación: un precio que pasa
// de "sin precio propio" a "$500" es un aumento; de "$500" a "sin precio
// propio" es una baja.
function direccion(antes: number | null, despues: number | null): Direccion {
  const a = antes ?? 0;
  const d = despues ?? 0;
  if (d > a) return "sube";
  if (d < a) return "baja";
  return "igual";
}

function claseValor(dir: Direccion): string {
  if (dir === "sube") return "text-green-700 font-bold";
  if (dir === "baja") return "text-destructive font-bold";
  return "";
}

export function ConfirmSaveVariantsModal({
  open,
  onOpenChange,
  isLoadingDiff,
  filas,
  isSubmitting,
  onConfirm,
}: ConfirmSaveVariantsModalProps) {
  const [entendido, setEntendido] = useState(false);

  const eliminaciones = filas.filter((f) => f.seVaAEliminar);
  const hayEliminaciones = eliminaciones.length > 0;
  // Defensivo: en el flujo normal edit-sheet.tsx ya filtra esto antes de
  // abrir el modal (si no hay cambios, guarda directo sin mostrar nada),
  // pero si alguna vez llega vacío igual explicamos por qué en vez de
  // mostrar una tabla en blanco.
  const sinCambios = !isLoadingDiff && filas.length === 0;
  const puedeConfirmar =
    !isLoadingDiff && !isSubmitting && (!hayEliminaciones || entendido);

  const handleOpenChange = (next: boolean) => {
    if (!next) setEntendido(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-card border-border">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/20">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            {hayEliminaciones && (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            )}
            Confirmar cambios de variantes
          </DialogTitle>
          <DialogDescription className="sr-only">
            Revisá qué va a pasar con el stock y precio de cada variante antes
            de guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-2">
          {isLoadingDiff ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Comparando contra el estado actual en base...
            </div>
          ) : sinCambios ? (
            <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
              <p className="text-sm font-semibold text-foreground">
                No hay cambios que confirmar
              </p>
              <p className="text-xs text-muted-foreground">
                Ninguna variante cambia de stock o precio.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">
                  {filas.length} variante{filas.length === 1 ? "" : "s"}
                </strong>{" "}
                {filas.length === 1 ? "va" : "van"} a cambiar.
              </p>

              <ScrollArea className="h-64 border border-border rounded-xl bg-muted/20">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Variante</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filas.map((fila) => {
                      const dirStock = direccion(
                        fila.stockAntes,
                        fila.stockDespues,
                      );
                      const dirPrecio = direccion(
                        fila.precioAntes,
                        fila.precioDespues,
                      );

                      return (
                        <tr
                          key={fila.key}
                          className={
                            fila.seVaAEliminar ? "bg-[var(--bg-danger)]" : ""
                          }
                        >
                          <td className="px-3 py-2 font-medium">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{fila.atributosLabel}</span>
                              {fila.seVaAEliminar && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] font-bold"
                                >
                                  Se eliminará
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fila.seVaAEliminar ? (
                              <span className="text-destructive">
                                {fila.stockAntes} → 0
                              </span>
                            ) : (
                              <span>
                                {fila.stockAntes}{" "}
                                <span className="text-muted-foreground">→</span>{" "}
                                <span className={claseValor(dirStock)}>
                                  {fila.stockDespues}
                                </span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fila.seVaAEliminar ? (
                              <span className="text-destructive">—</span>
                            ) : (
                              <span>
                                {fila.precioAntes
                                  ? formatearMoneda(fila.precioAntes)
                                  : "—"}{" "}
                                <span className="text-muted-foreground">→</span>{" "}
                                <span className={claseValor(dirPrecio)}>
                                  {fila.precioDespues
                                    ? formatearMoneda(fila.precioDespues)
                                    : "—"}
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>

              {hayEliminaciones && (
                <div className="flex items-start gap-2 bg-[var(--bg-danger)] p-3 rounded-lg border border-destructive/40">
                  <input
                    type="checkbox"
                    id="confirm_eliminaciones"
                    checked={entendido}
                    onChange={(e) => setEntendido(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-destructive text-destructive focus:ring-destructive accent-destructive cursor-pointer shrink-0"
                  />
                  <Label
                    htmlFor="confirm_eliminaciones"
                    className="text-destructive cursor-pointer leading-tight font-medium text-xs"
                  >
                    Sí, entiendo que se van a eliminar {eliminaciones.length}{" "}
                    variante{eliminaciones.length === 1 ? "" : "s"} y su stock (
                    {eliminaciones.reduce((sum, f) => sum + f.stockAntes, 0)}{" "}
                    unidades en total).
                  </Label>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={!puedeConfirmar}
              className={
                hayEliminaciones
                  ? "bg-destructive hover:bg-destructive/90 text-white"
                  : ""
              }
            >
              {isSubmitting && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Confirmar y guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
