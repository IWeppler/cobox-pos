import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "./server";

/**
 * El rol en el negocio activo, UNA sola vez por request.
 *
 * Mismo problema y misma solución que `getUsuarioActual`: `rol_actual()` es
 * una llamada de red, y se estaba haciendo dos veces en cada pantalla del
 * panel — el layout del dashboard la hace, y después CADA página abajo la
 * repite por su cuenta en el mismo render (`/ventas`, `/stock`, `/clientes`,
 * `/caja`, `/stock/bajas`).
 *
 * Medido en producción sobre los 11 segundos que siguen a UNA venta:
 * 18 llamadas a `rol_actual`, 17 a `is_super_admin` y 18 a `/auth/v1/user`,
 * contra 13 viajes que hace la venta entera. La mayoría son la misma pregunta
 * repetida dentro del mismo render.
 *
 * `cache()` de React deduplica dentro de ese render: la primera se paga y las
 * demás salen gratis. No cambia nada del aislamiento — sigue siendo la misma
 * función `rol_actual()` con la misma sesión y el mismo negocio activo, y el
 * caché vive y muere con el request, así que no puede cruzar usuarios ni
 * negocios.
 *
 * NO sirve para el middleware: corre en otra ejecución, antes del render, y no
 * comparte este caché. Ahí la mejora es ir menos veces (ver `contexto_sesion`).
 *
 * Solo para Server Components. Las server actions son otro request y vuelven a
 * preguntar, que es lo correcto: cada una es su propia puerta.
 */
export interface ContextoSesion {
  rol: string | null;
  esSuperAdmin: boolean;
}

/**
 * Rol + super admin, UNA sola vez por request y en UN solo viaje.
 *
 * Usa la misma `contexto_sesion()` que el middleware (migración
 * 20260822170000). El cast es porque la función es nueva y todavía no está en
 * los tipos generados de Supabase.
 */
export const getContextoSesion = cache(async (): Promise<ContextoSesion> => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.rpc("contexto_sesion").maybeSingle();
  const fila = data as {
    rol: string | null;
    es_super_admin: boolean | null;
  } | null;

  return {
    rol: fila?.rol ?? null,
    esSuperAdmin: fila?.es_super_admin ?? false,
  };
});

/** Solo el rol. Comparte el viaje con `getContextoSesion` en el mismo render. */
export const getRolActual = cache(async (): Promise<string | null> => {
  const { rol } = await getContextoSesion();
  return rol;
});
