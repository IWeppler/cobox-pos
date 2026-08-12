"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import {
  COOKIE_NEGOCIO_ACTIVO,
  COOKIE_NEGOCIO_MAX_AGE,
} from "@/shared/lib/negocio-activo";
import { destinoSinNegocio } from "./registro";

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
    // Con el alta self-service abierta, "sin negocio" dejó de ser un callejón.
    // Antes acá se cerraba la sesión y se le decía que pidiera una invitación;
    // eso ahora dejaría afuera a quien se registró para abrir SU comercio y no
    // llegó a crearlo. `destinoSinNegocio` separa los dos casos por la
    // invitación pendiente.
    cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);
    const { destino, error: aviso } = await destinoSinNegocio(
      supabase,
      sesion.user.email,
    );

    if (!destino) {
      // Invitación pendiente: la sesión no le sirve para nada hasta que use el
      // link, así que se cierra igual que antes.
      await supabase.auth.signOut();
      return { error: aviso };
    }

    return { error: "", success: true, destino };
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
