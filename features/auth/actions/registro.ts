"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { COOKIE_NEGOCIO_ACTIVO } from "@/shared/lib/negocio-activo";
import { SITE_URL } from "@/shared/lib/dominios";

export interface RegistroState {
  error: string;
  success?: boolean;
  /** A dónde mandarlo. Vacío = quedarse en la pantalla y leer `aviso`. */
  destino?: string;
  /** Mensaje cuando NO hay sesión inmediata (confirmación por email prendida). */
  aviso?: string;
}

/**
 * Alta de cuenta propia. La puerta del onboarding self-service.
 *
 * Hasta acá no existía: el modo "registro" del panel escribía en
 * `solicitudes_comercio` —datos de contacto, sin cuenta— y Comerz contestaba
 * por WhatsApp. Ahora el usuario crea su cuenta y sigue solo hasta adentro.
 *
 * Lo que este action NO hace: crear el negocio. Eso son los pasos 2 y 3 del
 * stepper, y van separados porque la RPC de alta necesita una sesión — la
 * cuenta tiene que existir antes. Si alguien abandona en el medio queda con
 * cuenta y sin negocio, que es un estado válido: el login y el middleware lo
 * devuelven a /onboarding y retoma en el paso 2.
 */
export async function registrarseAction(
  prevState: RegistroState,
  formData: FormData,
): Promise<RegistroState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!email || !password || !nombre) {
    return { error: "Completá tu nombre, email y contraseña." };
  }

  // Mismo piso que pide Supabase por defecto. Se valida acá para dar un
  // mensaje en castellano en vez del error crudo del proveedor.
  if (password.length < 6) {
    return { error: "La contraseña necesita al menos 6 caracteres." };
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Revisá el email." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nombre },
      // A dónde vuelve después de confirmar. Se manda EXPLÍCITO y no se deja
      // que Supabase caiga a su "Site URL": ese es un campo del dashboard que
      // nadie mira, y quedó apuntando a http://localhost:3000 — o sea que el
      // mail de confirmación de un usuario real lo mandaba a su propia
      // computadora. Acá sale de la misma variable que ya usa el mail de
      // recuperación, así que las dos puntas se mueven juntas.
      //
      // Va a /auth/callback y no directo a /onboarding porque el link llega en
      // formato PKCE: lo que aterriza es un `code`, no una sesión, y alguien
      // tiene que canjearlo.
      emailRedirectTo: `${SITE_URL}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    console.error("[REGISTRO]", error);
    // Supabase responde lo mismo para "ya existe" que para otros errores según
    // la config de privacidad, así que no se afirma cuál fue.
    return {
      error:
        "No pudimos crear la cuenta. Puede que ya exista una con ese email — probá entrar o recuperar la contraseña.",
    };
  }

  // Sin sesión = el proyecto tiene la confirmación por email prendida. No es un
  // error: es el otro camino válido, y hay que decirlo en vez de dejar la
  // pantalla como si no hubiera pasado nada.
  if (!data.session) {
    return {
      error: "",
      success: true,
      aviso:
        "Te mandamos un mail para confirmar la cuenta. Abrilo y volvé para terminar de crear tu comercio.",
    };
  }

  // Cuenta nueva: no pertenece a ningún negocio todavía. Se limpia por las
  // dudas una cookie de negocio de una sesión anterior en el mismo navegador —
  // apuntaría a un negocio que este usuario no integra.
  cookieStore.delete(COOKIE_NEGOCIO_ACTIVO);

  return { error: "", success: true, destino: "/onboarding" };
}

/**
 * Qué hacer con una cuenta que no pertenece a ningún negocio.
 *
 * Con el alta self-service abierta, "sin negocio" dejó de significar una sola
 * cosa. Hay dos personas distintas en ese estado y mandarlas al mismo lugar
 * deja a una de las dos golpeando una puerta cerrada:
 *
 *   - Alguien que se registró para abrir SU comercio y todavía no lo creó
 *     (o abandonó a mitad). Tiene que poder seguir: /onboarding.
 *   - Un empleado invitado que entró antes de usar el link de la invitación.
 *     Crear un negocio propio sería exactamente lo que NO quiere hacer.
 *
 * Se distinguen por la invitación pendiente, que es el único rastro que dejó
 * quien lo invitó.
 */
export async function destinoSinNegocio(
  supabase: ReturnType<typeof createClient>,
  email: string | undefined,
): Promise<{ destino: string; error: string }> {
  if (!email) return { destino: "/onboarding", error: "" };

  const { data: invitacion } = await supabase
    .from("invitaciones")
    .select("id")
    .eq("email", email.toLowerCase())
    .eq("estado", "PENDIENTE")
    .maybeSingle();

  if (invitacion) {
    return {
      destino: "",
      error:
        "Tenés una invitación pendiente: abrí el link que te llegó por mail para entrar al negocio que te invitó.",
    };
  }

  return { destino: "/onboarding", error: "" };
}
