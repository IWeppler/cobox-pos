"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import {
  COOKIE_NEGOCIO_ACTIVO,
  COOKIE_NEGOCIO_MAX_AGE,
} from "@/shared/lib/negocio-activo";

export interface UpdatePasswordState {
  error: string;
  success: boolean;
  /** Solo cuando vino de una invitación: a dónde mandarla después. */
  destino?: string;
}

export async function resetPasswordFinalAction(
  prevState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;
  // Viene del link del mail de invitación. Si está, además de la contraseña
  // hay que sumar a la persona al negocio que la invitó.
  const invitacion = (formData.get("invitacion") as string) || null;

  if (!password || !confirmPassword) {
    return { error: "Todos los campos son obligatorios.", success: false };
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden.", success: false };
  }

  if (password.length < 6) {
    return {
      error: "La contraseña debe tener al menos 6 caracteres.",
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    console.error("Error al actualizar la contraseña:", error);
    return {
      error: "Hubo un problema al actualizar la contraseña.",
      success: false,
    };
  }

  if (invitacion) {
    const { data: negocioId, error: errorInvitacion } = await supabase.rpc(
      "aceptar_invitacion",
      { p_token: invitacion },
    );

    if (errorInvitacion) {
      // La contraseña ya quedó guardada, así que no se pierde nada, pero hay
      // que decirlo: si no, entra y no ve ningún negocio.
      console.error("[ACEPTAR INVITACION AL CREAR PASSWORD]", errorInvitacion);
      return {
        error:
          "Tu contraseña quedó guardada, pero la invitación no se pudo aceptar (puede estar vencida). Pedile a tu encargada que te invite de nuevo.",
        success: false,
      };
    }

    cookieStore.set(COOKIE_NEGOCIO_ACTIVO, negocioId as string, {
      path: "/",
      maxAge: COOKIE_NEGOCIO_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
    });

    return { error: "", success: true, destino: "/pos" };
  }

  return { error: "", success: true };
}
