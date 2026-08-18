import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { COOKIE_NEGOCIO_ACTIVO } from "@/shared/lib/negocio-activo";
import type { ConfiguracionPOS } from "@/entities/config/types";

export interface ConfigPosDeLaRequest {
  id: string | null;
  posName: string | null;
  posLogo: string | null;
  /** El tipo viene de ConfiguracionPOS: el layout lo pasa derecho al Sidebar y
   * a la navbar, así que un `string` suelto acá se convertiría en un `as` allá. */
  modo_caja: ConfiguracionPOS["modo_caja"];
}

/**
 * La configuración del negocio activo, UNA sola vez por request.
 *
 * `configuracion_pos` es una fila por negocio que cambia una vez por mes, y se
 * estaba leyendo ~2.950 veces por día: el `generateMetadata` del layout raíz la
 * pedía en CADA request —incluidas las peticiones RSC— solo para el título de
 * la pestaña, y el layout del dashboard la volvía a pedir por su cuenta en el
 * mismo request. En la base cuesta 0,16 ms; lo que cuesta es el viaje de red,
 * que no aparece en ninguna métrica de Postgres.
 *
 * `cache()` de React deduplica dentro del MISMO render: `generateMetadata` y el
 * layout comparten la respuesta, así que dos viajes pasan a ser uno. No es un
 * caché entre requests — cada navegación vuelve a leer, y por eso un cambio de
 * configuración se ve al instante sin invalidar nada. Ese era justamente el
 * riesgo de cachear esto con `unstable_cache`: la config gobierna el modo de
 * caja y el recargo, y servirla vieja es el bug del recargo al 5% otra vez.
 *
 * Sigue pasando por RLS, con el cliente del usuario. Se descartó resolverlo con
 * el cliente de service_role justamente por eso: el aislamiento entre negocios
 * es la policy, no el código que la llama.
 */
export const leerConfigPos = cache(
  async (): Promise<ConfigPosDeLaRequest | null> => {
    const cookieStore = await cookies();

    // Sin negocio elegido no hay configuración que leer, y son muchas de las
    // requests: el login, el onboarding, la landing y todo el catálogo público
    // pasan por el layout raíz. Antes cada una de esas pagaba una consulta que
    // la RLS iba a responder vacía de todos modos.
    if (!cookieStore.get(COOKIE_NEGOCIO_ACTIVO)?.value) return null;

    const supabase = createClient(cookieStore);
    const { data, error } = await supabase
      .from("configuracion_pos")
      .select("id, posName, posLogo, modo_caja")
      .limit(1)
      .maybeSingle();

    // Devolver null y seguir es lo correcto —el layout tiene fallbacks y una
    // pestaña sin el nombre del comercio no justifica una pantalla de error—
    // pero NO puede ser silencioso: uno de los campos que se pierde es
    // `modo_caja`, y el fallback es "UNICA". O sea que un fallo de lectura no
    // deja al panel sin marca, deja a un negocio POR_USUARIO comportándose
    // como caja única, donde una vendedora ve y cierra el turno de otra.
    // Si esto aparece en el log, no es cosmético.
    if (error) {
      console.error("[CONFIG] No se pudo leer configuracion_pos:", error);
    }

    return (data as ConfigPosDeLaRequest | null) ?? null;
  },
);
