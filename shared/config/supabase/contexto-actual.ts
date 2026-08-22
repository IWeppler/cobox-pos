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
export const getRolActual = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.rpc("rol_actual");
  return (data as string | null) ?? null;
});
