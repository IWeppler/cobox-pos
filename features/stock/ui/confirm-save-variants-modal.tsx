"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Sparkles } from "lucide-react";
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

export type VarianteDiffTipo = "eliminada" | "modificada" | "nueva";

export type VarianteDiffRow = {
  key: string;
  atributosLabel: string;
  tipo: VarianteDiffTipo;
  stockAntes: number | null;
  stockDespues: number | null;
  precioAntes: number | null;
  precioDespues: number | null;
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

function GrupoDiff({
  titulo,
  icono,
  filas,
  claseFila,
  renderStock,
  renderPrecio,
}: {
  titulo: string;
  icono: React.ReactNode;
  filas: VarianteDiffRow[];
  claseFila?: string;
  renderStock: (fila: VarianteDiffRow) => React.ReactNode;
  renderPrecio: (fila: VarianteDiffRow) => React.ReactNode;
}) {
  if (filas.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {icono}
        {titulo} ({filas.length})
      </p>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs text-left">
          <tbody className="divide-y divide-border">
            {filas.map((fila) => (
              <tr key={fila.key} className={claseFila}>
                <td className="px-3 py-2 font-medium">{fila.atributosLabel}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {renderStock(fila)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {renderPrecio(fila)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

  const { eliminadas, modificadas, nuevas } = useMemo(() => {
    return {
      eliminadas: filas.filter((f) => f.tipo === "eliminada"),
      modificadas: filas.filter((f) => f.tipo === "modificada"),
      nuevas: filas.filter((f) => f.tipo === "nueva"),
    };
  }, [filas]);

  const hayEliminaciones = eliminadas.length > 0;
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
                {filas.length === 1 ? "va" : "van"} a cambiar:{" "}
                {eliminadas.length > 0 && (
                  <span className="text-destructive font-medium">
                    {eliminadas.length} eliminada
                    {eliminadas.length === 1 ? "" : "s"}
                  </span>
                )}
                {eliminadas.length > 0 &&
                  (modificadas.length > 0 || nuevas.length > 0) &&
                  ", "}
                {modificadas.length > 0 && (
                  <span className="font-medium">
                    {modificadas.length} modificada
                    {modificadas.length === 1 ? "" : "s"}
                  </span>
                )}
                {modificadas.length > 0 && nuevas.length > 0 && ", "}
                {nuevas.length > 0 && (
                  <span className="text-green-700 font-medium">
                    {nuevas.length} nueva{nuevas.length === 1 ? "" : "s"}
                  </span>
                )}
                .
              </p>

              <ScrollArea className="h-64 border border-border rounded-xl bg-muted/20 p-2">
                <div className="space-y-4">
                  <GrupoDiff
                    titulo="Se eliminarán"
                    icono={<AlertTriangle className="w-3.5 h-3.5" />}
                    filas={eliminadas}
                    claseFila="bg-[var(--bg-danger)]"
                    renderStock={(fila) => (
                      <span className="text-destructive">
                        {fila.stockAntes} → 0
                      </span>
                    )}
                    renderPrecio={() => (
                      <span className="text-destructive">—</span>
                    )}
                  />

                  <GrupoDiff
                    titulo="Se modifican"
                    icono={<Sparkles className="w-3.5 h-3.5" />}
                    filas={modificadas}
                    renderStock={(fila) => {
                      const dir = direccion(fila.stockAntes, fila.stockDespues);
                      return (
                        <span>
                          {fila.stockAntes}{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          <span className={claseValor(dir)}>
                            {fila.stockDespues}
                          </span>
                        </span>
                      );
                    }}
                    renderPrecio={(fila) => {
                      const dir = direccion(fila.precioAntes, fila.precioDespues);
                      return (
                        <span>
                          {fila.precioAntes
                            ? formatearMoneda(fila.precioAntes)
                            : "—"}{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          <span className={claseValor(dir)}>
                            {fila.precioDespues
                              ? formatearMoneda(fila.precioDespues)
                              : "—"}
                          </span>
                        </span>
                      );
                    }}
                  />

                  <GrupoDiff
                    titulo="Nuevas"
                    icono={<Plus className="w-3.5 h-3.5" />}
                    filas={nuevas}
                    renderStock={(fila) => (
                      <span className="text-green-700 font-bold">
                        {fila.stockDespues}
                      </span>
                    )}
                    renderPrecio={(fila) => (
                      <span className="text-green-700 font-bold">
                        {fila.precioDespues
                          ? formatearMoneda(fila.precioDespues)
                          : "—"}
                      </span>
                    )}
                  />
                </div>
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
                    Sí, entiendo que se van a eliminar {eliminadas.length}{" "}
                    variante{eliminadas.length === 1 ? "" : "s"} y su stock (
                    {eliminadas.reduce(
                      (sum, f) => sum + (f.stockAntes ?? 0),
                      0,
                    )}{" "}
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
