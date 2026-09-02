import { cache } from "react";
import { createPublicClient } from "@/shared/config/supabase/server";
import { COLUMNAS_CONFIG_PUBLICA } from "@/shared/lib/columnas-publicas";

/**
 * La configuración de la tienda, UNA sola vez por request.
 *
 * Hermana de `leerConfigPos`, para el otro lado del sistema. Aquella corta en
 * `haySesion()` y devuelve null sin sesión, así que el catálogo público —donde
 * el visitante es `anon` a propósito— nunca la pudo usar y cada página se leía
 * la fila por su cuenta.
 *
 * Cuánto costaba: `/rest/v1/configuracion_pos` era el endpoint REST más pedido
 * de todo el proyecto, 7.802 requests en 24h para una fila que cambia una vez
 * por mes, y 5.649 de esos (72%) venían del cliente anónimo del server, o sea
 * del catálogo. Son TRES lecturas por carga de tienda:
 *
 *   1. `layout.tsx` — la navbar, el whatsapp del carrito y el footer.
 *   2. `page.tsx` / `[producto]/page.tsx` en `generateMetadata` — el título y
 *      el preview de WhatsApp.
 *   3. el render de esa misma página.
 *
 * Next corre `generateMetadata` y el render en el MISMO request, y el layout
 * también, así que `cache()` de React las une: tres viajes a Ohio pasan a ser
 * uno. Con la base en us-east-2 y las funciones en cle1 cada viaje es barato,
 * pero son tres viajes en serie con el HTML esperando — y la regla de este
 * repo es contar round-trips antes que optimizar SQL.
 *
 * NO es caché entre requests: cada visita vuelve a leer, así que un cambio de
 * banner o de horario se ve al instante. Es la misma decisión (y por el mismo
 * motivo) que está documentada en `leerConfigPos`: esta fila gobierna precios
 * y modo de caja, y servirla vieja es el bug del recargo al 5% de vuelta.
 * El catálogo de productos SÍ se cachea entre requests, pero eso es
 * `unstable_cache` con su tag, en `shared/lib/cache-catalogo.ts`.
 *
 * Pide `COLUMNAS_CONFIG_PUBLICA` —lo que anon tiene concedido por GRANT— y no
 * `*`, que volvería 403 y dejaría la tienda sin navbar. Los llamadores que
 * necesitaban menos columnas (el `generateMetadata` de la portada leía solo
 * `posName, posLogo`) reciben de más y no de menos: pedir el conjunto completo
 * es lo que permite que las tres lecturas sean la MISMA y se deduplican.
 */
async function traerConfigPublica() {
  const supabase = await createPublicClient();

  const { data, error } = await supabase
    .from("configuracion_pos")
    .select(COLUMNAS_CONFIG_PUBLICA)
    .maybeSingle();

  // Igual que en `leerConfigPos`: se sigue con null —la tienda tiene fallbacks
  // y no vale una pantalla de error— pero no en silencio. Sin esta fila la
  // navbar pierde el nombre y el logo, el carrito pierde el WhatsApp al que se
  // manda el pedido y `mostrar_precios` cae al default. Si aparece en el log,
  // no es cosmético: es una tienda a la que no se le puede comprar.
  if (error) {
    console.error("[CATALOGO] No se pudo leer configuracion_pos:", error);
  }

  return data;
}

export const leerConfigPublica = cache(traerConfigPublica);

/** La fila como la ve el catálogo. Sale de la inferencia del select para que
 * agregar una columna a `COLUMNAS_CONFIG_PUBLICA` la propague sola. */
export type ConfigPublica = Awaited<ReturnType<typeof traerConfigPublica>>;
