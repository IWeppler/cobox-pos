"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { NOMBRE_FEATURE } from "@/shared/lib/planes";
import { formatearMoneda } from "@/shared/utils/formatters";
import { useContextoPlan, useTieneFeature } from "./plan-provider";

interface PaywallGateProps {
  /** Clave de la feature, tal como está en planes.reglas.features */
  feature: string;
  children: React.ReactNode;
  /** Nombre a mostrar si querés algo más específico que el del catálogo. */
  etiqueta?: string;
  /** Para que el candado no rompa layouts de bloque (tablas, tarjetas). */
  className?: string;
}

/**
 * Envuelve cualquier acción que dependa del plan.
 *
 * Con el plan correcto no hace nada: renderiza los children tal cual, sin un
 * nodo extra que pueda romper el layout. Sin el plan, muestra lo mismo pero
 * apagado, con candado, y al hacer click explica qué plan hace falta.
 *
 * Es UI, no seguridad: quien manda es la base (triggers y `tiene_feature`).
 * Acá se evita que el usuario descubra el límite recién cuando le rebota una
 * acción a medio camino.
 */
export function PaywallGate({
  feature,
  children,
  etiqueta,
  className,
}: Readonly<PaywallGateProps>) {
  const habilitada = useTieneFeature(feature);
  const contexto = useContextoPlan();
  const [abierto, setAbierto] = useState(false);

  if (habilitada) return <>{children}</>;

  const nombre = etiqueta ?? NOMBRE_FEATURE[feature] ?? feature;
  const necesario = contexto?.planMinimoPorFeature[feature];

  return (
    <>
      <div className={`relative inline-flex ${className ?? ""}`}>
        {/* El contenido real, apagado. aria-hidden porque el que recibe el
            foco y el click es el botón de arriba. */}
        <div
          aria-hidden
          className="pointer-events-none select-none opacity-40 grayscale"
        >
          {children}
        </div>

        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`${nombre}: disponible en el plan ${necesario?.nombre ?? "superior"}`}
          className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg cursor-pointer group"
        >
          <span className="flex items-center gap-1 rounded-full bg-background/90 border border-border px-2 py-0.5 shadow-sm transition-transform group-hover:scale-105">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </span>
        </button>
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-amber-500" />
            </div>

            <div className="space-y-2">
              <DialogTitle className="text-xl font-bold tracking-tight">
                {nombre} está en el plan {necesario?.nombre ?? "superior"}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {necesario ? (
                  <>
                    Para usar <strong>{nombre}</strong> necesitás el plan{" "}
                    <strong>{necesario.nombre}</strong>
                    {necesario.precio_mensual > 0 && (
                      <>
                        , desde{" "}
                        {formatearMoneda(necesario.precio_mensual)} por mes
                      </>
                    )}
                    .{" "}
                    {contexto?.planActual
                      ? `Hoy tenés el plan ${contexto.planActual}.`
                      : ""}
                  </>
                ) : (
                  <>
                    Esta función no está incluida en tu plan actual
                    {contexto?.planActual ? ` (${contexto.planActual})` : ""}.
                  </>
                )}
              </DialogDescription>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAbierto(false)}
              >
                Ahora no
              </Button>
              <Button asChild className="flex-1 gap-1.5">
                <Link href="/perfil?tab=plan">
                  Mejorar mi plan
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
