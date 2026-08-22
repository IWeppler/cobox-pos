import { redirect } from "next/navigation";
import { getContextoSesion } from "./contexto-actual";

/**
 * Frena a un VENDEDOR en las rutas de gestión, DESDE LA PÁGINA.
 *
 * Por qué existe teniendo el middleware: hasta ahora `/`, `/configuracion` y
 * `/compras/*` dependían EXCLUSIVAMENTE del bloqueo por rol del middleware
 * para no ser alcanzables. Ninguna de las tres tenía un control propio —
 * `/configuracion` mira `is_admin()` pero solo para esconder secciones, y
 * `/compras/merge/[id]` no miraba nada.
 *
 * Que una ruta quede autorizada por una regex de `matcher` y nada más es
 * frágil: cualquier cambio en ese patrón —o cualquier request que no lo
 * matchee— la deja abierta. Esto es defensa en profundidad; el middleware
 * sigue igual y sigue siendo el que redirige primero.
 *
 * ESPEJO EXACTO DEL MIDDLEWARE, y las dos cosas importan:
 *
 * 1. Bloquea solo a VENDEDOR. ENCARGADO entra, igual que hoy — un guard con
 *    `is_admin()` lo dejaría afuera y sería una regresión, no una mejora.
 * 2. El super admin queda exento: el middleware retorna antes de llegar al
 *    bloqueo por rol, así que hoy puede entrar. Sin esta salida, un super
 *    admin sin negocio activo (donde `rol_actual()` es null) terminaría
 *    rebotado a /pos.
 *
 * Rol nulo = VENDEDOR, el más restrictivo. Mismo criterio que el middleware.
 */
export function esVendedorBloqueado(contexto: {
  rol: string | null;
  esSuperAdmin: boolean;
}): boolean {
  if (contexto.esSuperAdmin) return false;
  return (contexto.rol ?? "VENDEDOR") === "VENDEDOR";
}

export async function bloquearVendedor(): Promise<void> {
  const contexto = await getContextoSesion();

  if (esVendedorBloqueado(contexto)) {
    redirect("/pos");
  }
}
