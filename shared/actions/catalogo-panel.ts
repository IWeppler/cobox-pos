"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Producto } from "@/entities/productos/types";
import {
  anotarStockDisponible,
  contarReservasActivasPorVariante,
} from "@/entities/productos/lib/stock-disponible";
import { traerTodo } from "@/shared/lib/traer-todo";
import { COLUMNAS_CATALOGO_PANEL } from "@/shared/lib/columnas-catalogo-panel";
import { leerRestoCatalogo, type RestoCatalogo } from "@/shared/lib/resto-catalogo";
import { calcularCursor } from "@/shared/lib/cursor-catalogo";

/**
 * EL catálogo del panel. Una sola consulta para /pos y para /stock.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 *
 * Las dos pantallas traían casi los mismos productos con dos consultas
 * distintas, en dos entradas de React Query separadas. Medido sobre Evens:
 *
 *   /stock  (getStockIndexAction) ............ 2.018.874 bytes
 *   /pos    (traerProductosPublicos) ......... 2.072.029 bytes
 *   ------------------------------------------------------------
 *   visitar las dos .......................... 4.090.903 bytes
 *   esta consulta canónica ................... 2.220.737 bytes  (−46%)
 *
 * O sea que ir de /pos a /stock volvía a bajar 2 MB con el 90% ya en memoria.
 *
 * LA DIFERENCIA REAL ENTRE LAS DOS ERA CHICA:
 *
 *   solo /stock ... el embed `categoria:categorias(id, nombre, slug)`
 *   solo /pos ..... negocio_id, descripcion, genero, atributos_globales,
 *                   creado_en
 *
 * Todo lo demás era idéntico. El costo de unir es que cada pantalla baja los
 * campos de la otra: +148.708 bytes para /pos (+7,2%) y +201.863 para /stock
 * (+10,0%) en su PRIMERA carga. A cambio, la segunda pantalla no baja nada.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * SIN FILTROS, y es la decisión que hace posible compartir. /pos mostraba solo
 * `publicado = true` y variantes `activa`; /stock muestra todo, porque para
 * corregir un producto despublicado hay que poder verlo. La canónica trae el
 * SUPERCONJUNTO —todo— y cada pantalla filtra en el cliente.
 *
 * Hoy eso no cuesta casi nada: de 1.987 productos hay 2 despublicados (los dos
 * en Ninja Camisetas) y CERO variantes inactivas en los seis negocios. Pero es
 * correcto por construcción, no por los datos de hoy.
 *
 * QUÉ NO TOCA. El catálogo PÚBLICO sigue con `traerProductosPublicos`, que
 * pide menos columnas (sin costos: anon no los tiene concedidos desde
 * 20260811140000) y corre como anon por slug. Son dos caminos distintos a
 * propósito y unirlos habría metido datos del comercio en la vidriera.
 */

export interface CatalogoPanel extends RestoCatalogo {
  /** TODOS los productos del negocio, sin filtrar. Cada pantalla se queda con
   * lo suyo: /pos con los publicados, /stock con todo. */
  productos: Producto[];
  /**
   * Hasta qué momento este catálogo está al día. Es lo que hace que la
   * PRÓXIMA carga no vuelva a bajar los 245 kB enteros: viaja adentro del
   * dato, así que el cache offline lo guarda y lo restaura junto con los
   * productos, sin ningún almacenamiento aparte.
   *
   * Y esa es la razón de que esté acá y no en su propia entrada de IndexedDB:
   * cursor y catálogo tienen que ser SIEMPRE de la misma foto. Guardados por
   * separado, un guardado que falla y otro que no dejarían un cursor adelantado
   * sobre un catálogo viejo, y el delta se saltearía en silencio todo lo del
   * medio. Juntos en el mismo objeto no hay forma de que se separen.
   */
  cursor: string;
}

export async function getCatalogoPanelAction(): Promise<{
  data: CatalogoPanel | null;
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // ANTES de leer, no después: lo que se escriba mientras corren las consultas
  // tiene que caer del lado de "todavía no lo tengo". Ver `cursor-catalogo.ts`.
  const cursor = calcularCursor();

  const [productosRes, reservasRes, resto] =
    await Promise.all([
      // Paginado: sin esto PostgREST corta en 1000 EN SILENCIO y las dos
      // pantallas mienten por omisión. Ver shared/lib/traer-todo.ts.
      traerTodo("catálogo del panel", (desde, hasta) =>
        supabase
          .from("productos")
          .select(COLUMNAS_CATALOGO_PANEL, { count: "exact" })
          .order("creado_en", { ascending: false })
          .range(desde, hasta),
      ),
      supabase.from("reservas").select("variante_id").eq("estado", "ACTIVA"),
      // Categorías y config, completas. Las comparte con el delta para que las
      // dos respuestas tengan exactamente la misma forma. Ver
      // `resto-catalogo.ts`.
      leerRestoCatalogo(supabase),
    ]);

  if (productosRes.error) {
    return { data: null, error: "No se pudo cargar el catálogo." };
  }

  // El stock neto de reservas activas se calcula UNA vez acá y viaja a las dos
  // pantallas. /pos lo lee (`stock_disponible ?? stock`) y /stock a propósito
  // no: en el inventario interesa la mercadería FÍSICA, no la disponible para
  // vender. Que el campo llegue igual no cambia nada — `getTotalStock` de
  // stock-product-utils lee `.stock` y solo eso.
  const reservasPorVariante = contarReservasActivasPorVariante(
    reservasRes.data,
  );
  const productos = (productosRes.data as unknown as Producto[]).map((p) => ({
    ...p,
    producto_variantes: anotarStockDisponible(
      p.producto_variantes,
      reservasPorVariante,
    ),
  }));

  return {
    data: { ...resto, productos, cursor },
    error: null,
  };
}
