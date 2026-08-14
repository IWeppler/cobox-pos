import "server-only";
import { headers } from "next/headers";
import { SITE_URL } from "./dominios";

/**
 * URL base del sitio TAL COMO la ve quien está usando la app ahora.
 *
 * Para los links que viajan por mail (confirmar cuenta, recuperar contraseña,
 * invitación), que tienen que volver al mismo lugar del que salieron.
 *
 * Por qué no alcanza `NEXT_PUBLIC_SITE_URL`: es una constante de build y apunta
 * a producción. Probando en localhost, el mail de confirmación te manda a
 * app.comerz.app — o sea que no se puede probar el flujo completo en local sin
 * romper el de producción. Y al revés: si alguien entra por un host alternativo,
 * el link lo saca de ahí.
 *
 * Ojo con la seguridad: el `host` lo manda el cliente y se puede falsificar, así
 * que esto NO es una defensa. La defensa real es la lista de Redirect URLs de
 * Supabase, que rechaza cualquier destino que no esté permitido — y ante uno no
 * permitido cae al Site URL del proyecto. Este helper elige a cuál de los
 * destinos YA permitidos ir, no abre destinos nuevos.
 */
export async function urlBaseDeLaRequest(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return SITE_URL;

  // En local no hay TLS; en cualquier otro lado sí. `x-forwarded-proto` lo pone
  // el proxy (Vercel, Cloudflare) y es más confiable que adivinar por el host.
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${proto}://${host}`;
}
