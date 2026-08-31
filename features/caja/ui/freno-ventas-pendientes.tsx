"use client";

import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useNegocioActivo } from "@/shared/components/negocio-activo-provider";
import { useVentasPendientesStore } from "@/shared/store/ventas-pendientes-store";

/**
 * El turno no se cierra con ventas sin subir.
 *
 * POR QUÉ. Un turno cerrado es INMUTABLE por RLS, a propósito. Si se cierra
 * con ventas todavía en el celular, esas ventas entran después contra un
 * arqueo que ya está firmado: el efectivo esperado que se comparó contra el
 * cajón no las incluía, así que el turno cierra con una diferencia que nadie
 * puede explicar y la venta queda colgada de un turno cerrado.
 *
 * El cierre es además el mejor momento posible para pedir esto: es el único
 * rato del día en que alguien está seguro con la app abierta y mirando la
 * pantalla, que es exactamente lo que la sincronización necesita en iOS —
 * donde no hay Background Sync y con la app cerrada no sube nada.
 *
 * ALCANCE HONESTO: la cola vive en el celular que cobró, así que este freno
 * también. Otro dispositivo —o la dueña desde su computadora— puede cerrar el
 * turno sin ver estas ventas, porque no las tiene. No hay forma de arreglar
 * eso del lado del server: el server no sabe qué hay en un celular al que no
 * llega. Por eso el aviso dice de DÓNDE hay que subirlas.
 */
export function useFrenoVentasPendientes() {
  const negocioId = useNegocioActivo()?.id ?? null;
  const pendientes = useVentasPendientesStore((s) => s.pendientes);
  const sincronizando = useVentasPendientesStore((s) => s.sincronizando);
  const sincronizar = useVentasPendientesStore((s) => s.sincronizar);

  return {
    pendientes,
    sincronizando,
    bloqueado: pendientes > 0,
    sincronizar: () => {
      if (negocioId) void sincronizar(negocioId);
    },
  };
}

export function AvisoVentasPendientes() {
  const { pendientes, sincronizando, sincronizar } = useFrenoVentasPendientes();

  if (pendientes === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        {pendientes === 1
          ? "Hay 1 venta cobrada sin conexión que todavía no subió"
          : `Hay ${pendientes} ventas cobradas sin conexión que todavía no subieron`}
      </p>
      <p className="text-[11px] leading-relaxed text-amber-700/80 dark:text-amber-400/80">
        No se puede cerrar el turno hasta que suban: el arqueo no las estaría
        contando. Tienen que subirse desde este mismo dispositivo.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={sincronizar}
        disabled={sincronizando}
        className="h-8 w-full"
      >
        {sincronizando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CloudUpload className="h-3.5 w-3.5" />
        )}
        {sincronizando ? "Subiendo..." : "Sincronizar ahora"}
      </Button>
    </div>
  );
}
