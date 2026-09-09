"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";

/**
 * Anota que esta persona VIO un paso del alta.
 *
 * Es el único escalón del embudo que no se deduce de `auth.users`, y sin él
 * "se le emitió sesión" y "abandonó el formulario" se ven igual — que es
 * exactamente lo que hizo leer mal las pérdidas de agosto y septiembre.
 *
 * NUNCA lanza: es telemetría al costado del alta, y un fallo suyo no puede
 * frenar a alguien que está creando su comercio. El usuario lo resuelve la
 * base con `auth.uid()`, así que acá no viaja ningún id.
 */
export async function registrarPasoOnboardingAction(paso: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { error } = await supabase.rpc("registrar_paso_onboarding", {
      p_paso: paso,
    });
    if (error) console.error("[ONBOARDING PASO]", error.message);
  } catch (err) {
    console.error("[ONBOARDING PASO] inesperado", err);
  }
}
