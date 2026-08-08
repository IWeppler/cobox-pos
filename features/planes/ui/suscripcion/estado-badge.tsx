import { AlertCircle, CheckCircle2, Clock, MinusCircle } from "lucide-react";
import type { EstadoSuscripcion } from "@/shared/lib/suscripcion";
import { PRESENTACION_ESTADO } from "@/shared/lib/suscripcion";

/**
 * Badge de estado. Lleva SIEMPRE ícono + texto, nunca sólo color: el estado no
 * puede depender de distinguir verde de rojo.
 */
const ESTILO_POR_TONO = {
  exito:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25",
  aviso: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/25",
  urgente:
    "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-amber-500/35",
  error: "bg-danger/10 text-danger ring-danger/25",
  neutral: "bg-muted text-muted-foreground ring-border",
} as const;

const ICONO_POR_ESTADO: Record<
  EstadoSuscripcion,
  React.ComponentType<{ className?: string }>
> = {
  ACTIVA: CheckCircle2,
  POR_VENCER: Clock,
  VENCIDA: AlertCircle,
  SUSPENDIDA: AlertCircle,
  CANCELADA: MinusCircle,
  SIN_PLAN: MinusCircle,
};

export function EstadoBadge({
  estado,
  className = "",
}: {
  estado: EstadoSuscripcion;
  className?: string;
}) {
  const { etiqueta, tono } = PRESENTACION_ESTADO[estado];
  const Icono = ICONO_POR_ESTADO[estado];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${ESTILO_POR_TONO[tono]} ${className}`}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {etiqueta}
    </span>
  );
}
