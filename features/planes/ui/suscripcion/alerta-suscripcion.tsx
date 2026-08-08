import { AlertCircle, Clock, Info } from "lucide-react";
import type { EstadoSuscripcion } from "@/shared/lib/suscripcion";
import { DIAS_VENCIMIENTO_URGENTE } from "@/shared/lib/suscripcion";

/**
 * Alerta contextual. Sólo aparece cuando hay algo que decir: con la
 * suscripción activa y el vencimiento lejos NO se muestra nada, para que
 * cuando aparezca signifique algo.
 *
 * El texto dice "vence" y no "próximo cobro" a propósito: hoy Comerz no tiene
 * cobro automático, así que `plan_vencimiento` es una fecha de fin real.
 * Prometer una renovación automática que no existe sería peor que no avisar.
 */
export function AlertaSuscripcion({
  estado,
  dias,
  fechaLegible,
}: {
  estado: EstadoSuscripcion;
  dias: number | null;
  fechaLegible: string | null;
}) {
  const contenido = mensajePara(estado, dias, fechaLegible);
  if (!contenido) return null;

  const { tono, titulo, detalle } = contenido;

  const estilos = {
    info: {
      caja: "bg-primary/5 border-primary/20",
      icono: "text-primary",
      Icono: Info,
    },
    aviso: {
      caja: "bg-amber-500/5 border-amber-500/30",
      icono: "text-amber-600 dark:text-amber-400",
      Icono: Clock,
    },
    error: {
      caja: "bg-danger/5 border-danger/30",
      icono: "text-danger",
      Icono: AlertCircle,
    },
  }[tono];

  const { Icono } = estilos;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border p-4 ${estilos.caja}`}
    >
      <Icono
        className={`mt-0.5 h-5 w-5 shrink-0 ${estilos.icono}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detalle}</p>
      </div>
    </div>
  );
}

function mensajePara(
  estado: EstadoSuscripcion,
  dias: number | null,
  fecha: string | null,
): { tono: "info" | "aviso" | "error"; titulo: string; detalle: string } | null {
  const el = fecha ? `el ${fecha}` : "próximamente";

  switch (estado) {
    case "SUSPENDIDA":
      return {
        tono: "error",
        titulo: "Tu cuenta está suspendida",
        detalle:
          "El acceso al sistema y tu catálogo público están cortados. Tus datos siguen intactos. Escribinos para reactivarla.",
      };
    case "CANCELADA":
      return {
        tono: "error",
        titulo: "Tu suscripción está cancelada",
        detalle:
          "Tus datos siguen guardados. Escribinos para volver a contratar y recuperar el acceso.",
      };
    case "VENCIDA":
      return {
        tono: "error",
        titulo: `Tu plan venció ${fecha ? `el ${fecha}` : ""}`.trim(),
        detalle:
          "Todavía podés usar Comerz, pero renovalo para no quedarte sin acceso. Escribinos para renovar.",
      };
    case "POR_VENCER": {
      if (dias === null) return null;
      const cuando =
        dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;
      const urgente = dias <= DIAS_VENCIMIENTO_URGENTE;
      return {
        tono: urgente ? "aviso" : "info",
        titulo: `Tu plan vence ${cuando}`,
        detalle: `Vence ${el}. La renovación no es automática: escribinos para renovarlo y evitar quedarte sin acceso.`,
      };
    }
    case "SIN_PLAN":
      return {
        tono: "info",
        titulo: "Este comercio todavía no tiene un plan asignado",
        detalle:
          "Mientras tanto no se aplica ningún límite y tenés todas las funcionalidades disponibles.",
      };
    default:
      return null;
  }
}
