import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HEADER_NEGOCIO_SLUG, slugDesdeHost } from "@/shared/lib/negocio-slug";
import {
  COOKIE_IMPERSONATE,
  COOKIE_NEGOCIO_ACTIVO,
  HEADER_IMPERSONATE,
  HEADER_NEGOCIO_ACTIVO,
} from "@/shared/lib/negocio-activo";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Qué negocio sirve el catálogo. Dos formas, misma resolución dinámica:
  // el subdominio (evens.comerz.app) o el primer segmento del path
  // (/store/evens). Si llegan las dos, gana el subdominio.
  const slugDelHost = slugDesdeHost(request.headers.get("host"));
  const slugDelPath = pathname.startsWith("/store/")
    ? (pathname.split("/")[2] || null)
    : null;
  const slugNegocio = slugDelHost ?? slugDelPath;

  // El header se reescribe siempre: nunca se confía en el que vino de afuera.
  // Sin slug se borra, y sin slug la RLS no devuelve catálogo alguno — ya no
  // existe el negocio por defecto.
  const conNegocio = () => {
    const headers = new Headers(request.headers);
    if (slugNegocio) {
      headers.set(HEADER_NEGOCIO_SLUG, slugNegocio);
    } else {
      headers.delete(HEADER_NEGOCIO_SLUG);
    }
    return { headers };
  };

  // En un subdominio de tienda, la raíz y /store son el catálogo de ESE
  // negocio. Se reescribe a la ruta canónica por path, que es la única que
  // existe: así hay un solo juego de páginas para los dos modos.
  if (slugDelHost && (pathname === "/" || pathname === "/store")) {
    const url = request.nextUrl.clone();
    url.pathname = `/store/${slugDelHost}`;
    return NextResponse.rewrite(url, { request: conNegocio() });
  }

  let supabaseResponse = NextResponse.next({
    request: conNegocio(),
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const negocioActivo = request.cookies.get(COOKIE_NEGOCIO_ACTIVO)?.value;
  const impersonando = request.cookies.get(COOKIE_IMPERSONATE)?.value;

  const headersNegocio: Record<string, string> = {};
  if (negocioActivo) headersNegocio[HEADER_NEGOCIO_ACTIVO] = negocioActivo;
  if (impersonando) headersNegocio[HEADER_IMPERSONATE] = impersonando;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    global: Object.keys(headersNegocio).length
      ? { headers: headersNegocio }
      : undefined,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request: conNegocio(),
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicRoute =
    pathname.startsWith("/store") ||
    pathname.startsWith("/recuperar")
  // Rutas donde todavía no hay negocio elegido: son justamente las que sirven
  // para elegirlo o crear el primero.
  const isRutaSinNegocio =
    pathname.startsWith("/seleccionar-negocio") ||
    pathname.startsWith("/crear-negocio") ||
    pathname.startsWith("/invitacion");

  // 1. Rol del usuario EN EL NEGOCIO ACTIVO (ya no es un dato del perfil: el
  // mismo usuario puede ser ADMIN en un negocio y VENDEDOR en otro).
  let rolActual: string | null = null;
  let rol = null;
  if (user) {
    const { data } = await supabase.rpc("rol_actual");
    rolActual = data ?? null;

    // Si por algún motivo falla, asumimos el rol más restrictivo (VENDEDOR)
    rol = rolActual || "VENDEDOR";
  }

  // 2. Control de usuarios NO autenticados
  if (!user) {
    if (pathname === "/") {
      // La raíz sin sesión y sin subdominio de tienda es la landing de comerz,
      // no el catálogo de un comercio: no hay tenant por defecto.
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      return NextResponse.redirect(url);
    }
    if (!isAuthRoute && !isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 3. Super admin de comerz: no pertenece a ningún negocio, así que queda
  // fuera de todo el control por rol y negocio activo. Su lugar es /admincomerz.
  const { data: esSuperAdmin } = await supabase.rpc("is_super_admin");
  if (esSuperAdmin) {
    if (isAuthRoute || pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/admincomerz";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 4. Logueado con negocios pero sin uno elegido: al selector.
  // Sin NINGÚN negocio no se lo manda a crear uno —crear negocio es un flujo
  // explícito, no la salida de un login incompleto—: se lo devuelve al login,
  // que le explica que le falta una invitación.
  if (user && !rolActual && !isRutaSinNegocio && !isPublicRoute && !isAuthRoute) {
    const { count } = await supabase
      .from("usuarios_negocios")
      .select("negocio_id", { count: "exact", head: true })
      .eq("usuario_id", user.id);

    const url = request.nextUrl.clone();
    if ((count ?? 0) > 0) {
      url.pathname = "/seleccionar-negocio";
    } else {
      url.pathname = "/auth";
      url.searchParams.set("error", "sin-negocio");
    }
    return NextResponse.redirect(url);
  }

  // 5. Control de usuarios SI autenticados yendo al Login. Solo si ya tienen
  // negocio resuelto: si no, quedarían rebotando entre /auth y el gate de
  // arriba.
  if (user && isAuthRoute && rolActual) {
    const url = request.nextUrl.clone();
    // Admin va al dashboard, vendedor va al stock
    url.pathname = rol === "ADMIN" ? "/" : "/pos";
    return NextResponse.redirect(url);
  }

  // 6. Bloqueos específicos para el VENDEDOR
  if (rol === "VENDEDOR") {
    const isDashboard = pathname === "/";
    const isConfig = pathname.startsWith("/configuracion");
    const isCompras = pathname.startsWith("/compras");

    // Si intenta entrar a una ruta prohibida, lo devolvemos al pos
    if (isDashboard || isConfig || isCompras) {
      const url = request.nextUrl.clone();
      url.pathname = "/pos";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
