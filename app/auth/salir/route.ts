import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_IMPERSONATE,
  COOKIE_NEGOCIO_ACTIVO,
} from "@/shared/lib/negocio-activo";
import { DESTINO_LOGIN_SESION_VENCIDA } from "@/shared/lib/salir-sesion";

/**
 * Cierra la sesión y limpia TODO antes de mandar al login.
 *
 * Es un route handler y no una página ni un Server Component por un motivo
 * concreto: es el único contexto donde escribir cookies funciona de verdad.
 * `createClient` de `shared/config/supabase/server.ts` tiene un `try/catch`
 * alrededor del `setAll` para tolerar los Server Components, así que ahí el
 * borrado se descarta en silencio — que es exactamente la falla que dejaba a
 * la PWA rebotando con un token muerto.
 *
 * Ver `shared/lib/salir-sesion.ts` para el incidente que lo motivó.
 *
 * Los borrados van sobre la RESPUESTA y no dependen de que `signOut()` salga
 * bien: cuando se llega acá la sesión del servidor normalmente YA no existe
 * (403 `session_not_found`), así que la llamada puede fallar y las cookies
 * tienen que irse igual. Ese es el punto entero de la ruta.
 */
async function salir(request: NextRequest) {
  const respuesta = NextResponse.redirect(
    new URL(DESTINO_LOGIN_SESION_VENCIDA, request.url),
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  try {
    // `local`: no se intenta revocar en el servidor una sesión que ya puede no
    // existir. Lo que hace falta acá es soltar las cookies de ESTE navegador.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Sin sesión válida esto puede tirar; el borrado de abajo no depende de él.
  }

  // Red de seguridad: si `signOut()` no llegó a limpiar (token inválido, error
  // de red), las cookies de auth se borran a mano. Son las `sb-*` que escribe
  // @supabase/ssr, con sus sufijos de chunk (`.0`, `.1`) cuando el token no
  // entra en una sola.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      respuesta.cookies.delete(cookie.name);
    }
  }

  // El negocio activo y el modo dios son de la sesión que se acaba de cerrar,
  // pero su cookie dura 30 días. Mismo borrado que `logoutAction`, y por el
  // mismo motivo: sin esto el server sigue mandando `x-negocio-activo` de
  // alguien que ya no está logueado y `leerConfigPos` consulta como `anon`.
  respuesta.cookies.delete(COOKIE_NEGOCIO_ACTIVO);
  respuesta.cookies.delete(COOKIE_IMPERSONATE);

  return respuesta;
}

export async function GET(request: NextRequest) {
  return salir(request);
}

/**
 * También por POST: un `redirect()` desde un Server Component llega como GET,
 * pero un formulario o un `fetch` de salida puede llegar por POST y no tiene
 * por qué recibir un 405 justo cuando se está tratando de cerrar la sesión.
 */
export async function POST(request: NextRequest) {
  return salir(request);
}
