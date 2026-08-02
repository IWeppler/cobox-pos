"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import type { ReglasPlan } from "@/shared/lib/planes";

export interface PlanMinimo {
  nombre: string;
  precio_mensual: number;
}

export interface ContextoPlan {
  /** Nombre del plan del negocio activo. Null si todavía no tiene uno. */
  planActual: string | null;
  /** Features habilitadas hoy. */
  features: string[];
  /**
   * Para cada feature, el plan MÁS BARATO que la incluye. Es lo que el paywall
   * necesita para decir "necesitás el plan X" sin hardcodear la escalera de
   * planes en el frontend.
   */
  planMinimoPorFeature: Record<string, PlanMinimo>;
  /**
   * Sin plan asignado no se bloquea nada (mismo criterio que en la base): los
   * comercios que ya venían trabajando no tienen plan cargado.
   */
  sinPlan: boolean;
}

export async function getContextoPlanAction(): Promise<ContextoPlan> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: negocioId } = await supabase.rpc("negocio_actual");

  const [{ data: negocio }, { data: planes }] = await Promise.all([
    negocioId
      ? supabase
          .from("negocios")
          .select("plan_id, planes(nombre, reglas)")
          .eq("id", negocioId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("planes")
      .select("nombre, precio_mensual, reglas")
      .eq("activo", true)
      .order("precio_mensual", { ascending: true }),
  ]);

  const planActivo = Array.isArray(negocio?.planes)
    ? negocio?.planes[0]
    : negocio?.planes;

  const reglas = (planActivo?.reglas ?? {}) as ReglasPlan;

  // Los planes vienen del más barato al más caro, así que el primero que
  // incluye una feature es el mínimo necesario.
  const planMinimoPorFeature: Record<string, PlanMinimo> = {};
  for (const plan of planes ?? []) {
    const features = ((plan.reglas ?? {}) as ReglasPlan).features ?? [];
    for (const feature of features) {
      if (planMinimoPorFeature[feature]) continue;
      planMinimoPorFeature[feature] = {
        nombre: plan.nombre as string,
        precio_mensual: Number(plan.precio_mensual ?? 0),
      };
    }
  }

  return {
    planActual: (planActivo?.nombre as string | undefined) ?? null,
    features: reglas.features ?? [],
    planMinimoPorFeature,
    sinPlan: !negocio?.plan_id,
  };
}
