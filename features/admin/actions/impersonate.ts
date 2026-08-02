"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/config/supabase/server";
import { COOKIE_IMPERSONATE } from "@/shared/lib/negocio-activo";

export async function iniciarImpersonationAction(negocioId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificamos por seguridad que el usuario actual sea super admin
  const { data: isAdmin } = await supabase.rpc("is_super_admin");
  if (!isAdmin) {
    throw new Error("No autorizado");
  }

  // Seteamos la cookie de simulación por 2 horas.
  //
  // httpOnly va en false a propósito: el cliente de browser la lee para
  // reenviarla como header x-impersonate-negocio, que es la única forma de que
  // llegue a PostgREST (supabase-js habla con otro origen y no manda cookies).
  // No es una credencial: security.current_negocio_id() solo la honra si
  // is_super_admin(), así que en cualquier otra cuenta no hace nada.
  cookieStore.set(COOKIE_IMPERSONATE, negocioId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2, // 2 horas
  });

  // Redirigimos al stock o al dashboard general del POS
  redirect("/stock");
}

/** Sale del modo dios y vuelve al panel de Comerz. */
export async function terminarImpersonationAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_IMPERSONATE);
  redirect("/admincomerz/negocios");
}
