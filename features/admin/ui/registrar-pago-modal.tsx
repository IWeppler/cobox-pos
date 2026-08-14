"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  registrarPagoAction,
  type ResultadoAccion,
} from "@/features/admin/actions/acciones-comercio";

const estadoInicial: ResultadoAccion = { error: null, success: false };

/** Un mes desde `desde`, en ISO. UTC de punta a punta: con getMonth() local un
 * período que arranca el día 1 se corre al mes anterior. */
function unMesDespues(desde: string): string {
  const f = new Date(desde);
  const siguiente = new Date(
    Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()),
  );
  return siguiente.toISOString().slice(0, 10);
}

/**
 * Carga de un cobro.
 *
 * El período se pide explícito y no se asume "hoy + 30": si el pago entra
 * tarde, el mes cubierto sigue siendo el que se pagó. Asumir la fecha de carga
 * le regalaría los días de atraso a quien paga tarde y se los sacaría a quien
 * paga antes.
 */
export function RegistrarPagoModal({
  open,
  onOpenChange,
  negocioId,
  nombre,
  precioSugerido,
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  negocioId: string;
  nombre: string;
  precioSugerido: number;
}>) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy);
  const [estado, accion, enviando] = useActionState(
    registrarPagoAction,
    estadoInicial,
  );

  const [consumido, setConsumido] = useState(false);
  if (estado.success && !consumido) {
    setConsumido(true);
    onOpenChange(false);
    toast.success("Pago registrado y vencimiento actualizado");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Registrar pago</DialogTitle>
        <DialogDescription>
          {nombre}. Al guardar, el vencimiento pasa al final del período que
          cubre este pago.
        </DialogDescription>

        <form action={accion} className="space-y-4">
          <input type="hidden" name="negocio_id" value={negocioId} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="monto">Monto</Label>
              <Input
                id="monto"
                name="monto"
                type="number"
                min="0"
                step="any"
                required
                defaultValue={precioSugerido || ""}
                className="h-10 font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha_pago">Fecha del pago</Label>
              <Input
                id="fecha_pago"
                name="fecha_pago"
                type="date"
                defaultValue={hoy}
                className="h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="periodo_desde">Cubre desde</Label>
              <Input
                id="periodo_desde"
                name="periodo_desde"
                type="date"
                required
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodo_hasta">Hasta</Label>
              <Input
                id="periodo_hasta"
                name="periodo_hasta"
                type="date"
                required
                // Se re-siembra con `key` cuando cambia el inicio: el default
                // de un input no controlado no se actualiza solo.
                key={desde}
                defaultValue={unMesDespues(desde)}
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="medio">Medio</Label>
            <select
              id="medio"
              name="medio"
              defaultValue="transferencia"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="transferencia">Transferencia</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="efectivo">Efectivo</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nota">Nota (opcional)</Label>
            <Input id="nota" name="nota" className="h-10" />
          </div>

          {estado.error && (
            <p className="text-sm text-destructive" role="alert">
              {estado.error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={enviando}>
              {enviando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Registrar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
