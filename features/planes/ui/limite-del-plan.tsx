"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useContextoPlan } from "./plan-provider";
import { planQueSubeElLimite } from "@/features/planes/lib/beneficios-al-subir";
import type { ReglasPlan } from "@/shared/lib/planes";

/**
 * Medidor de un límite del plan: "5 de 5 usuarios".
 *
 * Es el hermano de PaywallGate y resuelve el caso que ese NO cubre: tener la
 * función y haber agotado el cupo. Son cosas distintas y la UI tiene que
 * decirlas distinto — un candado sobre algo que el comercio ya usa todos los
 * días le dice "no lo compraste" cuando lo que pasa es "lo llenaste".
 *
 * El caso real que lo motivó: Evens está en 5 de 5 usuarios con el plan
 * Gestión. Como SÍ tiene la feature `roles`, el PaywallGate del botón de
 * invitar lo dejaba pasar; recién al mandar la invitación la base la rechazaba
 * con 23514 (`validar_limite_usuarios` cuenta miembros + invitaciones
 * pendientes). O sea, el error aparecía después de escribir el mail de la
 * vendedora, que es justo lo que el paywall dice querer evitar.
 *
 * El CTA apunta al plan que sube ESTE límite, no al siguiente de la lista: a
 * quien está lleno de usuarios no le sirve que le ofrezcan reportes.
 */
export function LimiteDelPlan({
  usado,
  limite,
  singular,
  plural,
  claveLimite,
  children,
  avisoDesde = 0.8,
  siempreVisible = false,
}: Readonly<{
  usado: number;
  /** Tope del plan. `null` es ilimitado: no hay nada que medir. */
  limite: number | null | undefined;
  singular: string;
  plural: string;
  claveLimite: keyof ReglasPlan;
  /** La acción que consume el cupo, si el límite tiene una sola puerta clara
   * (cargar un producto). Se muestra normal mientras haya lugar y se deja de
   * montar al llegar al tope.
   *
   * Se omite cuando el cupo NO se consume desde un botón: el de cuenta
   * corriente se ocupa al fiarle a alguien en el POS, no al dar de alta al
   * cliente, así que ahí el componente es solo el medidor. */
  children?: React.ReactNode;
  /** A partir de qué proporción se avisa que se está por llenar. Avisar antes
   * de llegar es lo que le da tiempo al comercio a decidir sin apuro. */
  avisoDesde?: number;
  /** Deja el medidor a la vista incluso lejos del tope. Es la diferencia entre
   * "te avisamos cuando chocaste" y "sabés todo el tiempo en qué punto estás";
   * sin esto el upgrade no se ve venir, que es justo lo que hace inútil una
   * escalera de planes. */
  siempreVisible?: boolean;
}>) {
  const contexto = useContextoPlan();

  // Sin plan cargado no se mide nada, igual que en el resto del paywall: los
  // comercios sin plan asignado no pueden quedar bloqueados por esto.
  if (contexto?.sinPlan || typeof limite !== "number") {
    return <>{children}</>;
  }

  const lleno = usado >= limite;
  const cerca = !lleno && usado / limite >= avisoDesde;
  const destino = planQueSubeElLimite(contexto, claveLimite, limite);

  if (!lleno && !cerca && !siempreVisible) return <>{children}</>;

  return (
    <div className="w-full space-y-2">
      {/* Lleno: la acción no se monta. No se muestra apagada como en el
          PaywallGate porque acá el problema no es la función sino el cupo, y
          un botón fantasma invita a insistir. */}
      {!lleno && children}

      <div
        className={`rounded-xl border p-3 ${
          lleno
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-border bg-muted/30"
        }`}
      >
        <div className="flex items-start gap-2.5">
          {lleno && (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {usado} de {limite} {limite === 1 ? singular : plural}
              {lleno ? " — llegaste al tope de tu plan" : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {(() => {
                if (lleno) {
                  return destino
                    ? `El plan ${destino.nombre} te permite ${destino.limite === null ? "los que necesites" : destino.limite}.`
                    : "Tu plan es el más alto disponible. Escribinos y lo vemos.";
                }
                const libres = limite - usado;
                return `Te queda${libres === 1 ? "" : "n"} ${libres} lugar${libres === 1 ? "" : "es"}.`;
              })()}
            </p>
          </div>

          {lleno && destino && (
            <Button asChild size="sm" className="shrink-0 gap-1.5">
              <Link href="/perfil?tab=plan">
                Mejorar plan
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>

        <div
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={usado}
          aria-valuemin={0}
          aria-valuemax={limite}
          aria-label={`${plural} usados`}
        >
          <div
            className={`h-full rounded-full ${lleno ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${Math.min(100, (usado / limite) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
