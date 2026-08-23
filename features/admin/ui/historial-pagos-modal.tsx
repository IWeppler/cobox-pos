"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  getPagosDelNegocioAction,
  type PagoDelNegocio,
} from "@/features/admin/actions/acciones-comercio";
import { formatearMoneda } from "@/shared/utils/formatters";
import { CLASE_PORTAL_OSCURO } from "@/features/admin/lib/tema-portal";

const ETIQUETA_MEDIO: Record<string, string> = {
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  efectivo: "Efectivo",
  otro: "Otro",
};

/** Fecha "YYYY-MM-DD" leída en UTC. `new Date(iso).toLocaleDateString()` sin
 * timeZone corre el día una zona negativa como la de Argentina. */
function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

/**
 * Los cobros de un comercio.
 *
 * Se cargan al abrir y no con la tabla: son N comercios y este panel se mira
 * entero muchas veces por día, pero el historial de uno se abre de a uno.
 */
export function HistorialPagosModal({
  open,
  onOpenChange,
  negocioId,
  nombre,
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  negocioId: string;
  nombre: string;
}>) {
  // Se cachean POR comercio en vez de tener un solo `pagos` que se limpia al
  // abrir: limpiar era un setState sincrónico dentro del efecto (render en
  // cascada, y el linter lo marca). Con el mapa, "todavía no cargó" es
  // simplemente que la clave no está, sin ningún reset.
  const [porNegocio, setPorNegocio] = useState<
    Record<string, PagoDelNegocio[]>
  >({});
  const pagos = porNegocio[negocioId] ?? null;

  useEffect(() => {
    if (!open) return;
    let vigente = true;
    getPagosDelNegocioAction(negocioId).then((filas) => {
      // Guarda contra la respuesta que llega después de cerrar o de cambiar
      // de comercio: sin esto se pintan los pagos de otro.
      if (vigente) setPorNegocio((previo) => ({ ...previo, [negocioId]: filas }));
    });
    return () => {
      vigente = false;
    };
  }, [open, negocioId]);

  const total = (pagos ?? []).reduce((suma, p) => suma + p.monto, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-lg ${CLASE_PORTAL_OSCURO}`}>
        <DialogTitle>Pagos de {nombre}</DialogTitle>
        <DialogDescription>
          {pagos === null
            ? "Cargando…"
            : pagos.length === 0
              ? "Todavía no hay pagos registrados."
              : `${pagos.length} pago${pagos.length === 1 ? "" : "s"} · ${formatearMoneda(total)} en total.`}
        </DialogDescription>

        {pagos === null ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {pagos.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatearMoneda(p.monto)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cubre {fecha(p.periodo_desde)} → {fecha(p.periodo_hasta)}
                  </p>
                  {p.nota && (
                    <p className="mt-0.5 text-xs italic text-muted-foreground">
                      {p.nota}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium">
                    {ETIQUETA_MEDIO[p.medio] ?? p.medio}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fecha(p.fecha_pago)}
                  </p>
                  {p.plan_nombre && (
                    <p className="text-[10px] text-muted-foreground">
                      {p.plan_nombre}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
