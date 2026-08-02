"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageCircle, StickyNote } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { etiquetaRubro } from "@/shared/lib/rubros";
import {
  cambiarEstadoSolicitudAction,
  guardarNotaSolicitudAction,
  type EstadoSolicitud,
  type SolicitudComercio,
} from "@/features/admin/actions/solicitudes-actions";

const COLOR_ESTADO: Record<EstadoSolicitud, string> = {
  NUEVA: "bg-primary/10 text-primary border-primary/20",
  CONTACTADA: "bg-warning/10 text-warning border-warning/20",
  CONVERTIDA: "bg-success/10 text-success border-success/20",
  DESCARTADA: "bg-muted text-muted-foreground border-border",
};

export function FilaSolicitud({
  solicitud,
}: Readonly<{ solicitud: SolicitudComercio }>) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [estado, setEstado] = useState<EstadoSolicitud>(solicitud.estado);
  const [nota, setNota] = useState(solicitud.notas ?? "");
  const [editandoNota, setEditandoNota] = useState(false);

  // wa.me quiere sólo dígitos. Se asume Argentina si el número viene local,
  // que es de donde llegan todos los pedidos hoy.
  const soloDigitos = solicitud.whatsapp.replace(/\D/g, "");
  const numeroWa = soloDigitos.startsWith("54")
    ? soloDigitos
    : `54${soloDigitos}`;

  const cambiarEstado = (nuevo: string) => {
    const anterior = estado;
    setEstado(nuevo as EstadoSolicitud);
    startTransition(async () => {
      const res = await cambiarEstadoSolicitudAction(
        solicitud.id,
        nuevo as EstadoSolicitud,
      );
      if (res.success) {
        router.refresh();
      } else {
        setEstado(anterior);
        toast.error(res.error ?? "No se pudo actualizar");
      }
    });
  };

  const guardarNota = () => {
    startTransition(async () => {
      const res = await guardarNotaSolicitudAction(solicitud.id, nota);
      if (res.success) {
        setEditandoNota(false);
        toast.success("Nota guardada");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  };

  return (
    <li className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{solicitud.nombre_comercio}</p>
          <p className="text-sm text-muted-foreground truncate">
            {solicitud.nombre_contacto} ·{" "}
            {etiquetaRubro(solicitud.rubro, solicitud.rubro_otro)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(solicitud.creado_en).toLocaleString("es-AR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a
              href={`https://wa.me/${numeroWa}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-3.5 text-success" />
              {solicitud.whatsapp}
            </a>
          </Button>

          <Select
            value={estado}
            onValueChange={cambiarEstado}
            disabled={pendiente}
          >
            <SelectTrigger
              className={`h-8 w-36 text-xs border ${COLOR_ESTADO[estado]}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NUEVA">Nueva</SelectItem>
              <SelectItem value="CONTACTADA">Contactada</SelectItem>
              <SelectItem value="CONVERTIDA">Convertida</SelectItem>
              <SelectItem value="DESCARTADA">Descartada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {editandoNota ? (
        <div className="flex items-center gap-2">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={pendiente}
            placeholder="Qué hablaron, qué quedó pendiente…"
            className="h-9 text-sm bg-background"
          />
          <Button size="sm" onClick={guardarNota} disabled={pendiente}>
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : "Guardar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNota(solicitud.notas ?? "");
              setEditandoNota(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditandoNota(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <StickyNote className="size-3.5" />
          {solicitud.notas || "Agregar una nota"}
        </button>
      )}
    </li>
  );
}
