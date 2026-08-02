"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";

export async function resetPasswordAction(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Por favor, ingresá un correo válido.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // originUrl sirve para decirle a Supabase a dónde enviar al usuario 
  // después de que haga clic en el correo.
  const originUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Redirigimos a la vista donde el usuario escribirá la NUEVA contraseña
    redirectTo: `${originUrl}/auth/actualizar-password`,
  });

  if (error) {
    console.error("Error al enviar email de recuperación:", error);
    return { 
      error: "No pudimos enviar el correo. Verificá que la dirección sea correcta.", 
      success: false 
    };
  }

  return { error: "", success: true };
}