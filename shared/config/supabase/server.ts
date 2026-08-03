import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { HEADER_NEGOCIO_SLUG } from "@/shared/lib/negocio-slug";
import {
  COOKIE_IMPERSONATE,
  COOKIE_NEGOCIO_ACTIVO,
  HEADER_IMPERSONATE,
  HEADER_NEGOCIO_ACTIVO,
} from "@/shared/lib/negocio-activo";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) => {
  // Qué negocio está mirando el usuario. La base valida la membresía, así que
  // un valor manipulado no abre nada: como mucho deja de resolver.
  const negocioActivo = cookieStore.get(COOKIE_NEGOCIO_ACTIVO)?.value;
  // Modo Dios. La base solo lo honra si is_super_admin(): mandarlo a mano
  // desde otra cuenta no hace nada.
  const impersonando = cookieStore.get(COOKIE_IMPERSONATE)?.value;

  const headersNegocio: Record<string, string> = {};
  if (negocioActivo) headersNegocio[HEADER_NEGOCIO_ACTIVO] = negocioActivo;
  if (impersonando) headersNegocio[HEADER_IMPERSONATE] = impersonando;

  return createServerClient(supabaseUrl!, supabaseKey!, {
    global: Object.keys(headersNegocio).length
      ? { headers: headersNegocio }
      : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
};

/**
 * Cliente para las páginas del catálogo público, donde el negocio lo define el
 * subdominio o el path. Reenvía el header x-negocio-slug que puso el
 * middleware: sin él, la policy de anon no sabe qué tienda servir y no
 * devuelve nada.
 *
 * En el catálogo NO se manda la sesión a propósito. Si se mandaba, el visitante
 * logueado dejaba de ser `anon` y la RLS pasaba a evaluar la restrictive de
 * `authenticated` (negocio activo del usuario), no la del slug: un super admin
 * o alguien con más de un negocio recibía CERO filas y la tienda reventaba con
 * `config === null` (incidente 2/8, catálogo de Evens en 500). El catálogo
 * público se sirve igual para todos: siempre anon, siempre por slug.
 *
 * Sin header no hay tienda que resolver: la llamada viene del POS (mismas
 * consultas de catálogo dentro del dashboard) y ahí sí manda la sesión, que es
 * lo que la restrictive de `authenticated` necesita.
 */
export const createPublicClient = async () => {
  const headerStore = await headers();
  const negocioSlug = headerStore.get(HEADER_NEGOCIO_SLUG);

  if (negocioSlug) {
    return createSupabaseClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { [HEADER_NEGOCIO_SLUG]: negocioSlug } },
    });
  }

  // Mismo cliente que el dashboard: además de la sesión reenvía el negocio
  // activo, que es lo que resuelve la restrictive de `authenticated` cuando el
  // usuario pertenece a más de un negocio.
  return createClient(await cookies());
};
