import { createBrowserClient } from "@supabase/ssr";
import { HEADER_NEGOCIO_SLUG, slugDesdeHost } from "@/shared/lib/negocio-slug";
import {
  COOKIE_IMPERSONATE,
  HEADER_IMPERSONATE,
  HEADER_NEGOCIO_ACTIVO,
  leerCookie,
  leerCookieNegocioActivo,
} from "@/shared/lib/negocio-activo";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export const createClient = () => {
  const enNavegador = typeof window !== "undefined";

  // En el navegador no pasa el middleware, así que el slug del negocio sale
  // del host. Las consultas del carrito público (anon) lo necesitan para que
  // la RLS sepa de qué tienda son el stock y los precios.
  const negocioSlug = enNavegador
    ? slugDesdeHost(window.location.hostname)
    : null;

  // Para el usuario logueado, el negocio activo sale de la cookie que dejó el
  // login o el selector de negocio.
  const negocioActivo = enNavegador
    ? leerCookieNegocioActivo(document.cookie)
    : null;

  // Modo Dios del super admin. Por eso la cookie no es httpOnly: el cliente de
  // browser tiene que poder reenviarla como header.
  const impersonando = enNavegador
    ? leerCookie(document.cookie, COOKIE_IMPERSONATE)
    : null;

  const headers: Record<string, string> = {};
  if (negocioSlug) headers[HEADER_NEGOCIO_SLUG] = negocioSlug;
  if (negocioActivo) headers[HEADER_NEGOCIO_ACTIVO] = negocioActivo;
  if (impersonando) headers[HEADER_IMPERSONATE] = impersonando;

  return createBrowserClient(supabaseUrl, supabaseKey, {
    global: Object.keys(headers).length ? { headers } : undefined,
  });
};
