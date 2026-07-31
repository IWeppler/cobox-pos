"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { PERMISOS, tienePermiso } from "@/shared/lib/permisos";

/**
 * ¿El usuario de esta sesión puede ver la Vista Gerencial de Caja (resumen
 * agregado del día: ventas totales, breakdown por medio de pago y
 * esperado/real/diferencia de TODAS las cajeras)?
 *
 * Server-side siempre: el resultado sirve para decidir qué renderizar, pero
 * cualquier acción o query que devuelva esos datos agregados tiene que volver
 * a chequear el permiso por su cuenta — esconder la UI no es un control de
 * acceso.
 */
export async function puedeVerVistaGerencialAction(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  return tienePermiso(supabase, PERMISOS.CAJA_VER_GERENCIAL);
}
