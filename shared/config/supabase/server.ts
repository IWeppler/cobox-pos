import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { HEADER_NEGOCIO_SLUG } from "@/shared/lib/negocio-slug";
import {
  COOKIE_NEGOCIO_ACTIVO,
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

  return createServerClient(supabaseUrl!, supabaseKey!, {
    global: negocioActivo
      ? { headers: { [HEADER_NEGOCIO_ACTIVO]: negocioActivo } }
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
 * Cliente para las páginas del catálogo público, donde no hay sesión y el
 * negocio lo define el subdominio. Reenvía el header x-negocio-slug que puso
 * el middleware: sin él, la policy de anon no sabe qué tienda servir y
 * (con más de un negocio dado de alta) no devuelve nada.
 */
export const createPublicClient = async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const negocioSlug = headerStore.get(HEADER_NEGOCIO_SLUG);

  return createServerClient(supabaseUrl!, supabaseKey!, {
    global: negocioSlug
      ? { headers: { [HEADER_NEGOCIO_SLUG]: negocioSlug } }
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
          // Igual que en createClient: desde un Server Component no se puede
          // escribir cookies y el refresh de sesión lo hace el middleware.
        }
      },
    },
  });
};
