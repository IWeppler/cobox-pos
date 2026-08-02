"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import {
  COOKIE_NEGOCIO_ACTIVO,
  COOKIE_NEGOCIO_MAX_AGE,
} from "@/shared/lib/negocio-activo";

export interface LoginState {
  error: string;
  success?: boolean;
  /** A dónde mandar al usuario según sus negocios. */
  destino?: string;
}

export async function loginAction(
  prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "El email y la contraseña son obligatorios." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: sesion, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Credenciales inválidas. Intenta de nuevo." };
  }

  // El super admin de Comerz no entra a ningún negocio: va al panel de la
  // plataforma. Se chequea antes que las membresías, que no tiene ni necesita.
  const { data: esSuperAdmin } = await supabase.rpc("is_super_admin");
  if (esSuperAdmin) {
    cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);
    return { error: "", success: true, destino: "/admincomerz" };
  }

  // Un usuario puede trabajar en varios negocios. Con uno solo se entra
  // derecho; con varios hay que elegir. La cookie es lo que después define el
  // negocio de cada consulta.
  const { data: membresias } = await supabase
    .from("usuarios_negocios")
    .select("negocio_id")
    .eq("usuario_id", sesion.user.id);

  const negocios = membresias ?? [];

  if (negocios.length === 0) {
    // Sin negocio no hay nada que mostrar. Se cierra la sesión para no dejarlo
    // dando vueltas logueado en una app vacía, y se le dice qué pasa: crear un
    // negocio es un flujo aparte, no el premio consuelo de un login fallido.
    await supabase.auth.signOut();
    cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);
    return {
      error:
        "Tu cuenta no está asociada a ningún negocio. Pedile a la persona a cargo que te invite.",
    };
  }

  if (negocios.length === 1) {
    cookieStore.set(COOKIE_NEGOCIO_ACTIVO, negocios[0].negocio_id, {
      path: "/",
      maxAge: COOKIE_NEGOCIO_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
    });
    return { error: "", success: true, destino: "/" };
  }

  // Con varios negocios no se adivina: equivocarse acá significa vender en la
  // caja del negocio que no es.
  cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);
  return { error: "", success: true, destino: "/seleccionar-negocio" };
}
