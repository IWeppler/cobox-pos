import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
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

  const pathname = request.nextUrl.pathname;

  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicRoute = pathname.startsWith("/store");

  // 1. Obtenemos el Rol del usuario (solo si está logueado)
  let rol = null;
  if (user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", user.id)
      .single();

    // Si por algún motivo falla, asumimos el rol más restrictivo (VENDEDOR)
    rol = perfil?.rol || "VENDEDOR";
  }

  // 2. Control de usuarios NO autenticados
  if (!user) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/store";
      return NextResponse.redirect(url);
    }
    if (!isAuthRoute && !isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 3. Control de usuarios SI autenticados yendo al Login
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    // Admin va al dashboard, vendedor va al stock
    url.pathname = rol === "ADMIN" ? "/" : "/stock";
    return NextResponse.redirect(url);
  }

  // 4. Bloqueos específicos para el VENDEDOR
  if (rol === "VENDEDOR") {
    const isDashboard = pathname === "/";
    const isConfig = pathname.startsWith("/configuracion");
    const isCompras = pathname.startsWith("/compras");

    // Si intenta entrar a una ruta prohibida, lo devolvemos al inventario
    if (isDashboard || isConfig || isCompras) {
      const url = request.nextUrl.clone();
      url.pathname = "/stock";
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
