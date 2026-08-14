"use client";

import Link from "next/link";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/ui/dialog";
import { NOMBRE_FEATURE } from "@/shared/lib/planes";
import { formatearMoneda } from "@/shared/utils/formatters";
import { beneficiosAlSubir } from "@/features/planes/lib/beneficios-al-subir";
import { useContextoPlan } from "./plan-provider";

/**
 * Módulo bloqueado: una maqueta de fondo y encima un modal que no se cierra.
 *
 * Usa el Dialog de la app y no un overlay propio: el velo translúcido, el
 * desenfoque, el centrado en el viewport y el foco atrapado ya son los mismos
 * de todos los modales. Con un contenedor propio el modal se posicionaba
 * contra el alto del fondo (no del viewport) y quedaba cortado abajo.
 *
 * OJO CON EL FONDO, que es la parte que importa: `children` es una MAQUETA, no
 * el módulo real. El blur es CSS —se saca desde las DevTools en dos clicks— así
 * que difuminar los reportes de verdad sería publicar la facturación del
 * comercio en el HTML y taparla con un filtro. Lo que se difumina es una vista
 * de muestra: alcanza para que se entienda que hay un módulo detrás, sin que
 * haya un solo dato real en la página.
 *
 * El modal no se cierra a propósito (sin botón de cerrar, sin Escape, sin
 * click afuera): no hay nada debajo para interactuar. Las dos salidas son
 * explícitas, volver al panel o ver los planes.
 *
 * Client component porque los beneficios salen del contexto del plan, que ya
 * está en memoria — no hace falta otra consulta.
 */
export function PaywallModulo({
  feature,
  titulo,
  descripcion,
  children,
}: Readonly<{
  feature: string;
  titulo?: string;
  descripcion: string;
  /** Maqueta decorativa del módulo. Nunca datos reales. */
  children?: React.ReactNode;
}>) {
  const contexto = useContextoPlan();
  const necesario = contexto?.planMinimoPorFeature[feature];
  const nombre = titulo ?? NOMBRE_FEATURE[feature] ?? feature;

  // Derivados de las reglas de los dos planes: la lista no se escribe a mano
  // justamente para que no vuelva a prometer algo que el plan no da.
  const beneficios = necesario
    ? beneficiosAlSubir(necesario.reglas, contexto?.reglasActuales ?? {})
    : [];

  return (
    <>
      {/* FONDO — inerte por partida doble: aria-hidden lo saca del árbol de
          accesibilidad y pointer-events-none impide cualquier click, aunque el
          Dialog modal ya bloquea la interacción por su cuenta. No lleva blur
          propio: el difuminado y el velo los pone el overlay del Dialog, el
          mismo de todos los modales de la app. */}
      <div aria-hidden className="pointer-events-none select-none">
        {children}
      </div>

      {/* Sin onOpenChange y sin las tres salidas de Radix: este modal no se
          cierra. No hay nada abajo para usar, así que dejarlo cerrar solo
          dejaría al usuario mirando una maqueta vacía sin saber por qué. */}
      <Dialog open>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="sm:max-w-md"
        >
          <div className="p-2 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10">
              <Sparkles className="size-7 text-amber-500" />
            </div>

            {/* DialogTitle y DialogDescription y no h2/p sueltos: Radix los usa
              para aria-labelledby y avisa por consola si faltan. */}
            <DialogTitle className="mt-4 text-xl font-bold tracking-tight text-foreground">
              {nombre} está en el plan {necesario?.nombre ?? "superior"}
            </DialogTitle>

            <DialogDescription className="mt-2 text-sm leading-relaxed">
              {descripcion}
            </DialogDescription>

            {beneficios.length > 0 && (
              <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Con el plan {necesario?.nombre} sumás
                </p>
                <ul className="mt-2.5 flex flex-col gap-2">
                  {beneficios.map((beneficio) => (
                    <li
                      key={beneficio.titulo}
                      className="flex items-start gap-2.5"
                    >
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Check className="size-2.5 text-primary" />
                      </span>
                      <span className="text-sm leading-snug text-foreground">
                        {beneficio.titulo}
                        {beneficio.detalle && (
                          <span className="block text-[11px] text-muted-foreground">
                            {beneficio.detalle}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="h-12 md:h-10 flex-1">
                <Link href="/">Volver al panel</Link>
              </Button>
              <Button asChild className="flex-1 gap-1.5">
                <Link href="/perfil?tab=plan">
                  Mejorar mi plan
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="size-3" />
              {necesario?.precio_mensual
                ? `Desde ${formatearMoneda(necesario.precio_mensual)} por mes.`
                : "Consultá los planes disponibles."}
              {contexto?.planActual ? ` Hoy tenés ${contexto.planActual}.` : ""}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
