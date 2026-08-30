import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { PERMISOS, tienePermiso } from "@/shared/lib/permisos";

/**
 * ¿Este usuario puede cobrar cuenta corriente?
 *
 * Cacheado por request (mismo criterio que `getRolActual`): el cobro tiene DOS
 * disparadores y los dos se resuelven en el mismo render — el layout, para el
 * modal de caja del navbar, y la página del POS, para el botón de la barra.
 * Sin `cache()` eso serían dos viajes a Ohio por cada carga de /pos para
 * contestar la misma pregunta.
 *
 * Solo sirve para decidir QUÉ MOSTRAR. La puerta real es el chequeo dentro de
 * `registrarPagoDeudaAction` — esconder el botón no es control de acceso.
 */
export const puedeCobrarCuentaCorriente = cache(async (): Promise<boolean> => {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  return tienePermiso(supabase, PERMISOS.CLIENTES_COBRAR_CC);
});
