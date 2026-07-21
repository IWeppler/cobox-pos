import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import type { EstadoCliente } from "@/features/clients/lib/clasificar-estado-cliente";

export const ESTADO_CLIENTE_CONFIG: Record<
  EstadoCliente,
  { label: string; icon: LucideIcon; className: string }
> = {
  al_dia: {
    label: "Al día",
    icon: CheckCircle2,
    className: "text-emerald-700 dark:text-accent-lime",
  },
  con_deuda: {
    label: "Con deuda",
    icon: Clock,
    className: "text-accent-orange",
  },
  vencido: {
    label: "Vencido",
    icon: AlertTriangle,
    className: "text-rose-600 dark:text-rose-400",
  },
};

interface ClienteEstadoBadgeProps {
  estado: EstadoCliente;
  iconClassName?: string;
  labelClassName?: string;
}

/** Badge visual de estado de deuda del cliente — mismo look en tabla y detalle. */
export function ClienteEstadoBadge({
  estado,
  iconClassName = "h-4 w-4 shrink-0",
  labelClassName = "",
}: Readonly<ClienteEstadoBadgeProps>) {
  const config = ESTADO_CLIENTE_CONFIG[estado];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 ${config.className}`}>
      <Icon className={iconClassName} />
      <span
        className={`text-[10px] font-bold uppercase tracking-widest ${labelClassName}`}
      >
        {config.label}
      </span>
    </span>
  );
}
