import { createBrowserClient } from "@supabase/ssr";
import { HEADER_NEGOCIO_SLUG, slugDesdeHost } from "@/shared/lib/negocio-slug";
import {
  HEADER_NEGOCIO_ACTIVO,
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

  const headers: Record<string, string> = {};
  if (negocioSlug) headers[HEADER_NEGOCIO_SLUG] = negocioSlug;
  if (negocioActivo) headers[HEADER_NEGOCIO_ACTIVO] = negocioActivo;

  return createBrowserClient(supabaseUrl, supabaseKey, {
    global: Object.keys(headers).length ? { headers } : undefined,
  });
};
