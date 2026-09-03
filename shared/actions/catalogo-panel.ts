"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Producto } from "@/entities/productos/types";
import { normalizarRubro, type Rubro } from "@/entities/config/types";
import {
  anotarStockDisponible,
  contarReservasActivasPorVariante,
} from "@/entities/productos/lib/stock-disponible";
import { traerTodo } from "@/shared/lib/traer-todo";

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

/** Las columnas del panel: la unión de lo que pedían las dos pantallas.
 *
 * En UNA línea a propósito: los tipos generados de supabase-js parsean el
 * string del select en tiempo de compilación y un salto de línea adentro de la
 * interpolación les da ParserError. Mismo motivo que en columnas-publicas.ts. */
const COLUMNAS_CATALOGO_PANEL =
  "id, negocio_id, nombre, slug, tipo, categoria_id, precio, precio_costo, unidad_medida, descripcion, marca, modelo, genero, atributos_globales, imagen_url, thumbnail_url, grid_url, publicado, creado_en, destacado_en, categoria:categorias(id, nombre, slug), producto_variantes(id, sku, nombre_display, precio, costo, stock, atributos)";

export interface CatalogoPanel {
  /** TODOS los productos del negocio, sin filtrar. Cada pantalla se queda con
   * lo suyo: /pos con los publicados, /stock con todo. */
  productos: Producto[];
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

export async function getCatalogoPanelAction(): Promise<{
  data: CatalogoPanel | null;
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [productosRes, reservasRes, categoriasRes, configRes] =
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

  // No aborta la pantalla si la config falla —se puede seguir vendiendo— pero
  // tampoco se traga el error: los cuatro valores caen al default a la vez y
  // el síntoma sería "mi comercio se llama Tienda Online".
  if (configRes.error) {
    console.error(
      "[CATALOGO PANEL] No se pudo leer configuracion_pos; se usan defaults:",
      configRes.error,
    );
  }

  return {
    data: {
      productos,
      categorias: categoriasRes.data ?? [],
      permitirVentaSinStock: configRes.data?.permitir_venta_sin_stock ?? false,
      nombreComercio: configRes.data?.posName || "Tienda Online",
      mostrarSinStock: configRes.data?.mostrar_sin_stock ?? true,
      // `normalizarRubro` ya es fail-closed: con un valor desconocido o sin
      // config devuelve indumentaria. No hace falta un `??` encima.
      rubro: normalizarRubro(configRes.data?.rubro),
    },
    error: null,
  };
}
