"use client";

import { useActionState, useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
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
  guardarCostoInfraAction,
  type CostoInfraFila,
  type EstadoCosto,
} from "@/features/admin/actions/costos-infra";
import type {
  MetricaConMotivo,
  ResumenCostos,
} from "@/features/admin/lib/metricas-saas";
import { formatearMoneda } from "@/shared/utils/formatters";

const estadoInicial: EstadoCosto = { error: null, success: false };

const ETIQUETA_PROVEEDOR: Record<string, string> = {
  vercel: "Vercel",
  supabase: "Supabase",
  dominio: "Dominio",
  otro: "Otro",
};

/**
 * Una métrica que puede no existir todavía.
 *
 * Cuando no hay número muestra "—" y el motivo, en vez del valor que saldría
 * de la cuenta. Con 4 comercios, un churn de 25% mensual es aritmética
 * correcta y estadística sin sentido —proyectado dice que el negocio se
 * termina en cuatro meses— y un número así, puesto en un tablero, termina
 * siendo una decisión.
 */
function Metrica({
  titulo,
  metrica,
  formato = "moneda",
  detalle,
}: Readonly<{
  titulo: string;
  metrica: MetricaConMotivo;
  formato?: "moneda" | "porcentaje";
  detalle?: string;
}>) {
  const hay = metrica.valor !== null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/35">
        {titulo}
      </p>
      <p
        className={`mt-1 text-xl font-semibold ${hay ? "text-white" : "text-white/25"}`}
      >
        {hay
          ? formato === "moneda"
            ? formatearMoneda(metrica.valor!)
            : `${metrica.valor!.toFixed(1)}%`
          : "—"}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-white/35">
        {hay ? (detalle ?? "") : metrica.motivo}
      </p>
    </div>
  );
}

export function MetricasSaasPanel({
  arpu,
  churn,
  ltv,
  costos,
  costosDelMes,
}: Readonly<{
  arpu: MetricaConMotivo;
  churn: MetricaConMotivo;
  ltv: MetricaConMotivo;
  costos: ResumenCostos;
  costosDelMes: CostoInfraFila[];
}>) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState(
    guardarCostoInfraAction,
    estadoInicial,
  );

  const [consumido, setConsumido] = useState(false);
  if (estado.success && !consumido) {
    setConsumido(true);
    setAbierto(false);
    toast.success("Costo guardado");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica
          titulo="ARPU"
          metrica={arpu}
          detalle="Cobrado este mes por comercio activo"
        />
        <Metrica
          titulo="Churn mensual"
          metrica={churn}
          formato="porcentaje"
          detalle="Bajas sobre los activos al empezar el mes"
        />
        <Metrica
          titulo="LTV"
          metrica={ltv}
          detalle="Lo que deja un comercio en toda su vida"
        />
        <Metrica
          titulo="Margen del mes"
          metrica={{
            valor: costos.margen,
            motivo: undefined,
          }}
          detalle={
            costos.margenPorcentaje !== null
              ? `${costos.margenPorcentaje.toFixed(0)}% de lo cobrado`
              : "Todavía no entró plata este mes"
          }
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white/90">
              Infraestructura: {formatearMoneda(costos.total)}
            </p>
            <p className="text-xs text-white/40">
              {costos.porComercio !== null
                ? `${formatearMoneda(costos.porComercio)} por comercio activo`
                : "Sin comercios activos para repartirlo"}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-white/60 hover:text-white"
            onClick={() => setAbierto(true)}
          >
            <Pencil className="size-3" />
            Cargar costo
          </Button>
        </div>

        {costosDelMes.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {costosDelMes.map((c) => (
              <li key={c.id} className="text-xs text-white/50">
                {ETIQUETA_PROVEEDOR[c.proveedor] ?? c.proveedor}{" "}
                <span className="font-mono text-white/80 tabular-nums">
                  {formatearMoneda(c.monto)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-white/30">
            Todavía no cargaste los costos de este mes: el margen de arriba está
            contando la infraestructura en cero.
          </p>
        )}
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Costo del mes</DialogTitle>
          <DialogDescription>
            Se guarda uno por proveedor y por mes. Cargarlo de nuevo lo corrige,
            no lo suma.
          </DialogDescription>

          <form action={accion} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proveedor">Proveedor</Label>
              <select
                id="proveedor"
                name="proveedor"
                defaultValue="vercel"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="vercel">Vercel</option>
                <option value="supabase">Supabase</option>
                <option value="dominio">Dominio</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto">Monto del mes</Label>
              <Input
                id="monto"
                name="monto"
                type="number"
                min="0"
                step="any"
                required
                className="h-10 font-mono"
              />
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
                onClick={() => setAbierto(false)}
                disabled={guardando}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={guardando}>
                {guardando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
