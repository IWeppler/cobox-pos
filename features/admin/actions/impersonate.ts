"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/config/supabase/server";

export async function iniciarImpersonationAction(negocioId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Verificamos por seguridad que el usuario actual sea super admin
  const { data: isAdmin } = await supabase.rpc("is_super_admin");
  if (!isAdmin) {
    throw new Error("No autorizado");
  }

  // Seteamos la cookie de simulación por 2 horas
  cookieStore.set("impersonate_negocio_id", negocioId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2, // 2 horas
  });

  // Redirigimos al stock o al dashboard general del POS
  redirect("/stock");
}