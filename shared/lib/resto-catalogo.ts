import { normalizarRubro, type Rubro } from "@/entities/config/types";
import type { createClient } from "@/shared/config/supabase/server";

/**
 * Todo lo del catálogo que NO son productos: las categorías y la config del
 * comercio.
 *
 * VIAJA COMPLETO EN CADA SINCRONIZACIÓN, también en la incremental, y es una
 * decisión de tamaño: los seis negocios juntos no llegan a 200 categorías de
 * cuatro columnas, contra los ~245 kB comprimidos que pesan los productos. Un
 * delta de categorías ahorraría kilobytes y agregaría un merge más —con su
 * propio manejo de bajas— a cambio de nada.
 *
 * Que venga completo tiene además una consecuencia buena: la lista de
 * categorías del cliente no puede quedar desincronizada por acumulación de
 * deltas. Se reemplaza entera todas las veces.
 *
 * (Efecto colateral: `idx_categorias_delta`, del 20260903120000, no lo usa
 * nadie hoy. Se deja porque la consulta que lo justificaba —"qué categorías
 * cambiaron"— es la que habría que escribir si algún día la lista crece, y
 * porque un índice de más en una tabla de cientos de filas no se siente.)
 *
 * VIVE ACÁ Y NO EN UNA DE LAS DOS ACTIONS porque las dos lo necesitan igual, y
 * un archivo `"use server"` no puede exportar nada que no sea una función
 * async: exportarlo desde ahí lo convertiría en un endpoint público.
 */
export interface RestoCatalogo {
  categorias: Array<{
    id: string;
    nombre: string;
    slug?: string | null;
    parent_id?: string | null;
  }>;
  permitirVentaSinStock: boolean;
  nombreComercio: string;
  mostrarSinStock: boolean;
  rubro: Rubro;
}

type ClienteServidor = ReturnType<typeof createClient>;

/**
 * Las dos consultas chicas del catálogo, en paralelo.
 *
 * No aborta nunca: sin categorías o sin config se puede seguir vendiendo. Pero
 * tampoco se traga el error de la config —los cuatro valores caen al default a
 * la vez y el síntoma sería "mi comercio se llama Tienda Online".
 */
export async function leerRestoCatalogo(
  supabase: ClienteServidor,
): Promise<RestoCatalogo> {
  const [categoriasRes, configRes] = await Promise.all([
    supabase
      .from("categorias")
      .select("id, nombre, slug, parent_id")
      .eq("activa", true)
      .order("orden", { ascending: true }),
    supabase
      .from("configuracion_pos")
      .select("permitir_venta_sin_stock, posName, mostrar_sin_stock, rubro")
      .maybeSingle(),
  ]);

  if (configRes.error) {
    console.error(
      "[CATALOGO] No se pudo leer configuracion_pos; se usan defaults:",
      configRes.error,
    );
  }

  return {
    categorias: categoriasRes.data ?? [],
    permitirVentaSinStock: configRes.data?.permitir_venta_sin_stock ?? false,
    nombreComercio: configRes.data?.posName || "Tienda Online",
    mostrarSinStock: configRes.data?.mostrar_sin_stock ?? true,
    // `normalizarRubro` ya es fail-closed: con un valor desconocido o sin
    // config devuelve indumentaria. No hace falta un `??` encima.
    rubro: normalizarRubro(configRes.data?.rubro),
  };
}
