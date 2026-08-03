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

/**
 * Headers de tenant, resueltos EN CADA REQUEST (no al crear el cliente).
 *
 * Por qué en cada request y no una vez: createBrowserClient de @supabase/ssr
 * es singleton — la primera llamada del navegador queda cacheada en el módulo
 * y todas las siguientes devuelven ESA instancia, con los headers congelados.
 * Como el login y el selector navegan con router.push (navegación blanda, sin
 * recargar la página), un cliente creado antes de que existiera la cookie
 * `negocio_activo_id` se quedaba sin header para el resto de la sesión: en la
 * base, security.current_negocio_id() devolvía NULL y la policy restrictive
 * `same_negocio` filtraba TODO. Síntoma: las páginas server-rendered mostraban
 * los datos (el cliente de servidor sí lee la cookie por request) y cualquier
 * consulta desde el navegador volvía vacía, sin error visible.
 *
 * Solo le pasaba a quien pertenece a más de un negocio: con una sola membresía
 * current_negocio_id() cae al fallback y el header no hace falta.
 */
const headersNegocio = (): Record<string, string> => {
  if (typeof window === "undefined") return {};

  const headers: Record<string, string> = {};

  // En el navegador no pasa el middleware, así que el slug del negocio sale
  // del host. Las consultas del carrito público (anon) lo necesitan para que
  // la RLS sepa de qué tienda son el stock y los precios.
  const negocioSlug = slugDesdeHost(window.location.hostname);
  if (negocioSlug) headers[HEADER_NEGOCIO_SLUG] = negocioSlug;

  // Para el usuario logueado, el negocio activo sale de la cookie que dejó el
  // login o el selector de negocio.
  const negocioActivo = leerCookieNegocioActivo(document.cookie);
  if (negocioActivo) headers[HEADER_NEGOCIO_ACTIVO] = negocioActivo;

  // Modo Dios del super admin. Por eso la cookie no es httpOnly: el cliente de
  // browser tiene que poder reenviarla como header.
  const impersonando = leerCookie(document.cookie, COOKIE_IMPERSONATE);
  if (impersonando) headers[HEADER_IMPERSONATE] = impersonando;

  return headers;
};

export const createClient = () =>
  createBrowserClient(supabaseUrl, supabaseKey, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        for (const [clave, valor] of Object.entries(headersNegocio())) {
          headers.set(clave, valor);
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
