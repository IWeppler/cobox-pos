"use client";

import { Tags } from "lucide-react";
import type { ListaPrecio } from "@/entities/precios/types";

/**
 * Con qué lista de precios se está armando el ticket.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO SE RENDERIZA SI EL COMERCIO NO TIENE LISTAS
 *
 * Que son 7 de los 8 negocios. La regla del proyecto es no agregar controles
 * al POS, y un selector con una sola opción no es un control: es ruido
 * permanente en la pantalla donde se cobra.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TIENE QUE SER IMPOSIBLE COBRAR MAYORISTA SIN DARSE CUENTA
 *
 * Por eso, con una lista elegida, esto no es un chip discreto: la franja se
 * pinta entera y dice el nombre. Es la única señal permanente de que los
 * precios del ticket no son los de siempre — cada renglón además muestra su
 * precio anterior tachado, pero eso se lee renglón por renglón y esto se ve
 * de una.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function SelectorListaPrecio({
  listas,
  listaPrecioId,
  onCambiar,
  deshabilitado = false,
}: Readonly<{
  listas: ListaPrecio[];
  listaPrecioId: string | null;
  onCambiar: (listaPrecioId: string | null) => void;
  /** Durante el envío de la venta: cambiar de lista ahí re-preciaría un ticket
   * que ya se está cobrando. */
  deshabilitado?: boolean;
}>) {
  if (listas.length === 0) return null;

  const activa = listas.find((l) => l.id === listaPrecioId) ?? null;

  const boton = (
    seleccionada: boolean,
    etiqueta: string,
    onClick: () => void,
    key: string,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-pressed={seleccionada}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        seleccionada
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {etiqueta}
    </button>
  );

  return (
    <div
      className={`border-b px-2 py-2 ${
        activa
          ? "border-amber-300 bg-amber-100/70 dark:border-amber-900/60 dark:bg-amber-950/40"
          : "border-border bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <Tags
          className={`h-4 w-4 shrink-0 ${
            activa ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
          }`}
        />
        <div className="flex min-w-0 flex-1 flex-wrap gap-1 rounded-xl bg-muted/60 p-0.5">
          {/* "Base" no es una lista guardada: es la ausencia de una. Ver
              `listas_precios` — no existe una fila "Minorista". */}
          {boton(!activa, "Base", () => onCambiar(null), "base")}
          {listas.map((lista) =>
            boton(
              lista.id === listaPrecioId,
              lista.nombre,
              () => onCambiar(lista.id),
              lista.id,
            ),
          )}
        </div>
      </div>

      {activa && (
        <p className="mt-1.5 pl-6 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          Precios de {activa.nombre}
          {!activa.admite_promociones && " · sin promociones encima"}
        </p>
      )}
    </div>
  );
}
