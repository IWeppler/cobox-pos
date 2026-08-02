"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/config/supabase/server";
import { createAdminClient, adminConfigurado } from "@/shared/config/supabase/admin";

export interface InvitacionActionState {
  error: string | null;
  success: boolean;
  /** Link de aceptación, para cuando no se puede mandar el mail. */
  link?: string | null;
  aviso?: string | null;
}

const baseUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * Invita a alguien al negocio activo: crea la invitación y le manda el mail de
 * Supabase. El link del mail la deja creando su contraseña, y recién cuando la
 * guarda se acepta la invitación y entra al negocio.
 */
export async function invitarEmpleadoAction(
  prevState: InvitacionActionState,
  formData: FormData,
): Promise<InvitacionActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rolId = String(formData.get("rol_id") ?? "");

  if (!email || !rolId) {
    return { error: "Falta el email o el rol.", success: false };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión vencida.", success: false };

  const { data: esAdmin } = await supabase.rpc("is_admin");
  if (!esAdmin) {
    return { error: "Solo un administrador puede invitar.", success: false };
  }

  // negocio_id lo pone el DEFAULT de la tabla (security.current_negocio_id()),
  // igual que en el resto: es la misma fuente que valida la policy.
  // La invitación se crea primero: si después falla el mail, el link sigue
  // sirviendo y se puede pasar a mano.
  const { data: invitacion, error: errorInsert } = await supabase
    .from("invitaciones")
    .insert({ email, rol_id: rolId, invitado_por: user.id })
    .select("token")
    .single();

  if (errorInsert) {
    console.error("[INVITAR EMPLEADO ERROR]", errorInsert);
    if (errorInsert.code === "23505") {
      return {
        error: "Ya hay una invitación pendiente para ese email.",
        success: false,
      };
    }
    return { error: "No se pudo crear la invitación.", success: false };
  }

  const link = `${baseUrl()}/auth/actualizar-password?invitacion=${invitacion.token}`;

  if (!adminConfigurado) {
    return {
      error: null,
      success: true,
      link,
      aviso:
        "No hay clave de servicio configurada, así que el mail no salió. Pasale este enlace.",
    };
  }

  const admin = createAdminClient();
  const { error: errorMail } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: link,
  });

  if (errorMail) {
    console.error("[INVITAR EMPLEADO MAIL]", errorMail);
    revalidatePath("/configuracion");

    // Caso común y esperable: ya tiene cuenta de Cobox (trabaja en otro
    // negocio, o ya trabajó acá). No hay mail de alta que mandarle, pero la
    // invitación es válida igual.
    const yaRegistrado =
      errorMail.status === 422 ||
      /already been registered|already registered|already exists/i.test(
        errorMail.message,
      );

    return {
      error: null,
      success: true,
      link,
      aviso: yaRegistrado
        ? "Esa persona ya tiene cuenta en Cobox, así que no se le manda un alta nueva. Pasale este enlace para que entre al negocio."
        : "La invitación quedó creada pero el mail no salió. Pasale este enlace.",
    };
  }

  revalidatePath("/configuracion");
  return { error: null, success: true, link: null, aviso: null };
}

export async function cancelarInvitacionAction(invitacionId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("invitaciones")
    .update({ estado: "CANCELADA" })
    .eq("id", invitacionId)
    .eq("estado", "PENDIENTE");

  if (error) {
    console.error("[CANCELAR INVITACION ERROR]", error);
    return { error: "No se pudo cancelar la invitación.", success: false };
  }

  revalidatePath("/configuracion");
  return { error: null, success: true };
}
