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
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
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

        <div className="p-6 space-y-4">
          {isLoadingDiff ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Comparando contra el estado actual en base...
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Se actualizarán{" "}
                <strong className="text-foreground">
                  {filas.length} variante{filas.length === 1 ? "" : "s"}
                </strong>{" "}
                que existen hoy para este producto.
              </p>

              <ScrollArea className="h-64 border border-border rounded-xl bg-muted/20">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Variante</th>
                      <th className="px-3 py-2 text-right">
                        Stock antes / después
                      </th>
                      <th className="px-3 py-2 text-right">
                        Precio antes / después
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filas.map((fila) => (
                      <tr
                        key={fila.key}
                        className={
                          fila.seVaAEliminar ? "bg-[var(--bg-danger)]" : ""
                        }
                      >
                        <td className="px-3 py-2 font-medium">
                          {fila.atributosLabel}
                          {fila.seVaAEliminar && (
                            <p className="text-destructive font-bold mt-0.5">
                              Esta variante se ELIMINARÁ
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fila.seVaAEliminar ? (
                            <span className="text-destructive font-bold">
                              {fila.stockAntes} → 0
                            </span>
                          ) : (
                            <span
                              className={
                                fila.stockAntes !== fila.stockDespues
                                  ? "font-bold"
                                  : ""
                              }
                            >
                              {fila.stockAntes} → {fila.stockDespues}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {fila.seVaAEliminar ? (
                            <span className="text-destructive font-bold">
                              —
                            </span>
                          ) : (
                            <span
                              className={
                                fila.precioAntes !== fila.precioDespues
                                  ? "font-bold"
                                  : ""
                              }
                            >
                              {fila.precioAntes
                                ? formatearMoneda(fila.precioAntes)
                                : "—"}{" "}
                              →{" "}
                              {fila.precioDespues
                                ? formatearMoneda(fila.precioDespues)
                                : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
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
