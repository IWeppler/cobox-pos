"use client";

import { createContext, useContext } from "react";
import type { ContextoPlan } from "@/features/planes/actions/contexto-plan";

const PlanContext = createContext<ContextoPlan | null>(null);

/**
 * Deja el plan del negocio activo disponible para toda la app. Lo resuelve el
 * layout en el server; así ninguna pantalla tiene que ir a buscarlo de nuevo
 * para saber si una función está incluida.
 */
export function PlanProvider({
  contexto,
  children,
}: Readonly<{ contexto: ContextoPlan | null; children: React.ReactNode }>) {
  return (
    <PlanContext.Provider value={contexto}>{children}</PlanContext.Provider>
  );
}

export function useContextoPlan(): ContextoPlan | null {
  return useContext(PlanContext);
}

/**
 * ¿El plan actual incluye esta función?
 *
 * Sin contexto o sin plan asignado devuelve true: el paywall no puede apagar
 * medio sistema por no haber cargado todavía. Mismo criterio que
 * `tiene_feature()` en la base, que es la que realmente manda.
 */
export function useTieneFeature(clave: string): boolean {
  const contexto = useContextoPlan();
  if (!contexto || contexto.sinPlan) return true;
  return contexto.features.includes(clave);
}
