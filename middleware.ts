import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HEADER_NEGOCIO_SLUG } from "@/shared/lib/negocio-slug";
import {
  clasificarHost,
  esHostDeDesarrollo,
  COOKIE_TIENDA_DEV,
  HEADER_MODO_CATALOGO,
  HEADER_TIENDA_DEV,
  PARAM_TIENDA_DEV,
} from "@/shared/lib/host-comerz";
import { decidirRuteo, RUTA_TIENDA_NO_ENCONTRADA } from "@/shared/lib/ruteo-host";
import { resolverTienda } from "@/shared/lib/cache-tenants";
import {
  COOKIE_IMPERSONATE,
  COOKIE_NEGOCIO_ACTIVO,
  HEADER_IMPERSONATE,
  HEADER_NEGOCIO_ACTIVO,
} from "@/shared/lib/negocio-activo";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host");

  // Override para probar subdominios sin DNS: ?tienda=evens una vez, y de ahí
  // en más lo sostiene la cookie —si no, el primer link interno vuelve al panel
  // y no se puede navegar el catálogo—. `?tienda=` vacío la borra. Solo se lee
  // en localhost y previews (`clasificarHost` lo vuelve a chequear).
  const paramTienda = request.nextUrl.searchParams.get(PARAM_TIENDA_DEV);
  const overrideTienda =
    paramTienda ??
    request.headers.get(HEADER_TIENDA_DEV) ??
    request.cookies.get(COOKIE_TIENDA_DEV)?.value ??
    null;

  const destino = clasificarHost(host, { overrideTienda });

  // Qué negocio sirve el catálogo. Dos formas, misma resolución dinámica:
  // el subdominio (evens.comerz.app) o el primer segmento del path
  // (/store/evens). Si llegan las dos, gana el subdominio.
  const slugDelHost = destino.tipo === "tienda" ? destino.slug : null;
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
    // Los links del catálogo dependen de cómo se está sirviendo: desde un
    // subdominio son relativos a la raíz. Se decide acá, donde ya se sabe.
    headers.set(HEADER_MODO_CATALOGO, slugDelHost ? "subdominio" : "path");
    return { headers };
  };

  /** Persiste (o borra) el override de desarrollo cuando vino por query. */
  const conCookieDev = <T extends NextResponse>(respuesta: T): T => {
    if (paramTienda === null || !esHostDeDesarrollo(host)) return respuesta;

    if (paramTienda) {
      respuesta.cookies.set(COOKIE_TIENDA_DEV, paramTienda, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    } else {
      respuesta.cookies.delete(COOKIE_TIENDA_DEV);
    }
    return respuesta;
  };

  // Ruteo por host, ANTES de cualquier consulta de sesión: el catálogo público
  // es anónimo y no tiene por qué pagar un getUser() por request.
  if (destino.tipo !== "app") {
    // El slug se valida contra el cache en memoria (TTL), no contra Supabase:
    // esto corre en cada request de cada tienda. `indeterminado` deja pasar
    // —lo resuelve la página— para que un parpadeo de la base no apague todos
    // los catálogos a la vez.
    let existe: boolean | null = null;
    if (destino.tipo === "tienda") {
      const resolucion = await resolverTienda(destino.slug);
      if (resolucion.estado !== "indeterminado") {
        existe = resolucion.estado === "existe";
      }
    }

    const accion = decidirRuteo({
      destino,
      pathname,
      search: request.nextUrl.search,
      tiendaExiste: existe,
    });

    if (accion.tipo === "redirect") {
      return conCookieDev(
        NextResponse.redirect(new URL(accion.destino, request.url)),
      );
    }

    if (accion.tipo === "no-encontrada") {
      const url = request.nextUrl.clone();
      url.pathname = RUTA_TIENDA_NO_ENCONTRADA;
      url.search = "";
      return conCookieDev(NextResponse.rewrite(url, { request: conNegocio() }));
    }

    if (accion.tipo === "rewrite") {
      const url = request.nextUrl.clone();
      url.pathname = accion.pathname;
      return conCookieDev(NextResponse.rewrite(url, { request: conNegocio() }));
    }
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
  // Las páginas legales se linkean desde el login: tienen que abrirse sin
  // sesión, o el link manda a /auth y no se lee nunca lo que se está por
  // aceptar.
  const isPublicRoute =
    pathname.startsWith("/store") ||
    pathname.startsWith("/recuperar") ||
    pathname.startsWith("/terminos") ||
    pathname.startsWith("/privacidad") ||
    // /onboarding es donde se CREA la cuenta: exigir sesión para entrar sería
    // pedirle la llave a quien viene a que se la demos. Va también en
    // `isRutaSinNegocio` de abajo, porque el que ya se registró y volvió
    // todavía no tiene negocio y no debe rebotar al selector.
    pathname.startsWith("/onboarding")
  // Rutas donde todavía no hay negocio elegido: son justamente las que sirven
  // para elegirlo o crear el primero.
  const isRutaSinNegocio =
    pathname.startsWith("/seleccionar-negocio") ||
    pathname.startsWith("/onboarding") ||
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
  //
  // Sin NINGÚN negocio ahora se lo manda a crear uno. Antes iba a /auth con
  // ?error=sin-negocio, porque el alta de comercios era manual y "sin negocio"
  // solo podía significar "empleado al que no invitaron". Con el alta
  // self-service abierta significa además "se registró para abrir su comercio
  // y todavía no lo creó", que es el camino normal del onboarding — devolverlo
  // al login lo dejaría sin forma de entrar nunca.
  //
  // Al empleado con invitación pendiente lo separa `destinoSinNegocio` en el
  // login, que es donde está el email para buscarla.
  if (user && !rolActual && !isRutaSinNegocio && !isPublicRoute && !isAuthRoute) {
    const { count } = await supabase
      .from("usuarios_negocios")
      .select("negocio_id", { count: "exact", head: true })
      .eq("usuario_id", user.id);

    const url = request.nextUrl.clone();
    url.pathname = (count ?? 0) > 0 ? "/seleccionar-negocio" : "/onboarding";
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

/**
 * El middleware corre en CADA request que pase por acá, y ahora además resuelve
 * el host. Todo lo que no es una página se saca del camino:
 *
 * - `/api`: no hay ruta de API que dependa del ruteo por host ni de la sesión
 *   del middleware; hacerlas pasar es latencia por nada.
 * - `/_next`, assets, íconos y el service worker: son archivos, no rutas.
 *   Además, en un subdominio de tienda entrarían al rewrite del catálogo.
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|apple-icon\\.png|icon\\.png|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|sw\\.js|workbox-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|woff2?|ttf)$).*)",
  ],
};
