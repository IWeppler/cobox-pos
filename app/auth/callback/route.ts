import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";

/**
 * Canje del `code` de PKCE por una sesión.
 *
 * Es el otro flujo de mails de Supabase Auth, y no lo cubría nadie:
 * `/auth/confirm` entiende `token_hash` + `verifyOtp`, que es el formato de la
 * invitación de empleados. Pero el mail de confirmación de alta llega como
 * PKCE — `.../auth/v1/verify?token=pkce_...&redirect_to=X` — y ahí Supabase
 * verifica de su lado y redirige a `X?code=...`. Ese `code` no es una sesión:
 * hay que cambiarlo por una, y si nadie lo hace el usuario aterriza deslogueado
 * y con un parámetro raro en la URL, como si el mail no hubiera servido de nada.
 *
 * `next` decide a dónde sigue después de canjear. El default es /onboarding
 * porque el caso normal es alguien que acaba de confirmar su cuenta y le falta
 * crear el comercio — el stepper lo detecta autenticado y arranca en el paso 2.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  // Solo rutas internas: un `next` absoluto convertiría esto en un redirect
  // abierto, o sea un link con nuestro dominio que lleva a cualquier lado.
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/onboarding";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent("El enlace no es válido o ya se usó.")}`,
    );
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[AUTH CALLBACK]", error);
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent("El enlace venció. Pedí uno nuevo.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${destino}`);
}
