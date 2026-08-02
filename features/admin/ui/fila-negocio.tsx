"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, KeyRound, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { iniciarImpersonationAction } from "@/features/admin/actions/impersonate";
import {
  asignarPlanAction,
  cambiarEstadoNegocioAction,
  type NegocioAdmin,
} from "@/features/admin/actions/metricas-comerz";

const SIN_PLAN = "sin-plan";

export function FilaNegocio({
  negocio,
  planes,
}: Readonly<{
  negocio: NegocioAdmin;
  planes: { id: string; nombre: string; precio_mensual: number }[];
}>) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [plan, setPlan] = useState(negocio.plan_id ?? SIN_PLAN);
  const [estado, setEstado] = useState(negocio.estado);

  const cambiarPlan = (nuevo: string) => {
    const anterior = plan;
    setPlan(nuevo);
    startTransition(async () => {
      // 12 meses por defecto: es el ciclo con el que se vende hoy.
      const res = await asignarPlanAction(
        negocio.id,
        nuevo === SIN_PLAN ? null : nuevo,
        12,
      );
      if (res.success) {
        toast.success("Plan actualizado");
        router.refresh();
      } else {
        setPlan(anterior);
        toast.error(res.error ?? "No se pudo actualizar");
      }
    });
  };

  const cambiarEstado = (nuevo: string) => {
    const anterior = estado;
    setEstado(nuevo);
    startTransition(async () => {
      const res = await cambiarEstadoNegocioAction(
        negocio.id,
        nuevo as "activo" | "suspendido" | "cancelado",
      );
      if (res.success) {
        toast.success(
          nuevo === "activo"
            ? "Comercio reactivado"
            : "Comercio fuera de servicio",
        );
        router.refresh();
      } else {
        setEstado(anterior);
        toast.error(res.error ?? "No se pudo cambiar el estado");
      }
    });
  };

  return (
    <tr className="border-b border-border last:border-0 align-middle">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium truncate">{negocio.nombre}</p>
            <p className="text-xs text-muted-foreground truncate">
              /store/{negocio.slug} · {negocio.usuarios} usuario
              {negocio.usuarios === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3">
        <span className="text-xs">
          {negocio.duenio ?? (
            <span className="text-muted-foreground">sin dueño</span>
          )}
        </span>
      </td>

      <td className="px-4 py-3">
        <Select value={plan} onValueChange={cambiarPlan} disabled={pendiente}>
          <SelectTrigger className="h-8 w-40 text-xs bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_PLAN}>Sin plan</SelectItem>
            {planes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-4 py-3 text-xs">
        {negocio.plan_vencimiento ? (
          <span className={negocio.vencido ? "text-danger font-medium" : ""}>
            {new Date(negocio.plan_vencimiento).toLocaleDateString("es-AR")}
            {negocio.vencido ? " (vencido)" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      <td className="px-4 py-3">
        <Select
          value={estado}
          onValueChange={cambiarEstado}
          disabled={pendiente}
        >
          <SelectTrigger className="h-8 w-36 text-xs bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="suspendido">Suspendido</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </td>

      <td className="px-4 py-3 text-right">
        <form action={iniciarImpersonationAction.bind(null, negocio.id)}>
          <button
            type="submit"
            disabled={pendiente}
            title="Entrar al POS de este comercio para dar soporte"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-lg transition-colors border border-border cursor-pointer disabled:opacity-50"
          >
            {pendiente ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <KeyRound className="w-3.5 h-3.5 text-warning" />
            )}
            Entrar
          </button>
        </form>
      </td>
    </tr>
  );
}
