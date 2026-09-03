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
 * Qué cambió en el catálogo desde la última sincronización.
 *
 * TODAVÍA NO LA CONSUME NADIE. Es la primera pieza de la sync incremental y se
 * puede verificar sola; el lado del cliente (el store en IndexedDB, el merge y
 * el cursor) viene después.
 *
 * PARA QUÉ. El catálogo completo se baja 6.849 veces por día, a ~245 kB
 * comprimidos: ~1,68 GB diarios, que es el grueso del egress del proyecto. Un
 * delta de 24 h son 56 productos y 132.796 bytes — el 6,0% del catálogo. Uno
 * de una hora, cero.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HALLAZGO 1: UN PRODUCTO CAMBIA SIN QUE SU FILA CAMBIE
 *
 * Una venta mueve `producto_variantes.updated_at` pero NO
 * `productos.updated_at`: son tablas distintas y el trigger de cada una mira
 * lo suyo. Medido sobre 24 h reales de Evens:
 *
 *   productos con su propia fila tocada .............. 30
 *   productos con alguna variante tocada ............. 41
 *   UNIÓN (lo que de verdad cambió) .................. 56
 *   productos que cambiaron SOLO por su variante ..... 26   ← 46%
 *
 * O sea que preguntar solo por `productos.updated_at` se pierde casi la mitad,
 * y el síntoma sería stock viejo en el POS sin ningún error. Por eso la
 * consulta busca los IDS primero, en las DOS tablas, y recién después trae los
 * productos completos de esa unión.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HALLAZGO 2: EL CURSOR NECESITA SOLAPAMIENTO
 *
 * Un cursor exacto pierde filas por cómo funcionan las transacciones, no por
 * un error de programación. La defensa es pedir de más. El porqué completo y
 * el número están en `shared/lib/cursor-catalogo.ts`, que es de donde lo toman
 * TAMBIÉN el catálogo completo (que siembra el primer cursor) y esta función.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * EL CURSOR LO DA EL SERVIDOR, SIEMPRE. El cliente guarda lo que le devuelve
 * esta función y lo manda de vuelta tal cual, sin mirarlo.
 *
 * El reloj que se usa es el de ESTA función (el server de Next), no el de
 * Postgres, y eso deja una diferencia posible entre los dos. Se acepta porque
 * los dos corren con NTP y el desfasaje real es de milisegundos, contra los 60
 * segundos de solapamiento que ya se piden de más por el HALLAZGO 2. Preguntar
 * la hora a la base costaría un viaje entero por sincronización para ganar
 * precisión que el margen ya regala.
 */

export interface CatalogoDelta {
  /** Categorías y config, COMPLETAS y no en delta: pesan kilobytes contra los
   * ~245 kB de los productos, y así la lista de categorías del cliente no
   * puede desincronizarse por acumulación. Ver `resto-catalogo.ts`. */
  resto: RestoCatalogo;
  /** Productos creados o modificados desde el cursor, completos. Se aplican
   * como upsert por id sobre la copia local. */
  productos: Producto[];
  /** Ids que dejaron de existir. Vienen de `catalogo_borrados`, que llena un
   * trigger AFTER DELETE — así ni el CASCADE se lo saltea. */
  borrados: { tabla: string; fila_id: string }[];
  /**
   * Reservas ACTIVAS por variante, de TODO el negocio y no solo de lo que
   * cambió.
   *
   * Va porque una reserva se crea sin tocar el producto: `reservas` es otra
   * tabla, así que ni `productos.updated_at` ni el de la variante se mueven y
   * el delta no trae ese producto. Sin el mapa completo, el
   * `stock_disponible` de la copia local se congelaría en el de la primera
   * carga y el POS ofrecería mercadería ya apartada.
   *
   * El merge lo aplica sobre el catálogo entero. Es idempotente —se calcula
   * desde `stock`, nunca desde el `stock_disponible` anterior— así que
   * re-anotar lo que el servidor ya anotó da exactamente lo mismo.
   */
  reservasPorVariante: Record<string, number>;
  /** El cursor para la PRÓXIMA llamada. Lo calcula el servidor. */
  cursor: string;
  /** El cliente pidió sin cursor, o con uno más viejo que la retención de
   * tombstones: `productos` trae el catálogo ENTERO y hay que reemplazar la
   * copia local en vez de mergear. */
  completo: boolean;
}

/** Cuántos ids entran en un `.in()`. El límite real es el largo de la URL;
 * 200 es el mismo número que ya usa `cargar-catalogo-import.ts`. */
const TAMANO_LOTE_IN = 200;

/**
 * Más viejo que esto y no se puede confiar en los tombstones: si en el medio
 * se purgaran, el cliente se quedaría con productos que ya no existen. Ante la
 * duda, catálogo completo.
 *
 * Hoy `catalogo_borrados` no se purga nunca, así que este techo es
 * conservador. Cuando se defina la purga, ESTE número tiene que ser menor que
 * la retención, y los dos se deciden juntos.
 */
const VENTANA_MAX_DIAS = 7;

export async function getCatalogoDeltaAction(
  cursorCliente?: string | null,
): Promise<{
  data: CatalogoDelta | null;
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // El reloj del servidor, no el del navegador. Ver el encabezado.
  const ahora = new Date();
  const cursorNuevo = calcularCursor(ahora);

  const desde = cursorCliente ? new Date(cursorCliente) : null;
  const demasiadoViejo =
    !desde ||
    Number.isNaN(desde.getTime()) ||
    ahora.getTime() - desde.getTime() > VENTANA_MAX_DIAS * 86_400_000;

  // ── Qué productos tocar ────────────────────────────────────────────────
  // Los ids salen de las DOS tablas y se unen. Ver el HALLAZGO 1.
  let ids: string[] | null = null;

  if (!demasiadoViejo) {
    const desdeIso = desde!.toISOString();

    const [porProducto, porVariante] = await Promise.all([
      supabase.from("productos").select("id").gt("updated_at", desdeIso),
      supabase
        .from("producto_variantes")
        .select("producto_id")
        .gt("updated_at", desdeIso),
    ]);

    if (porProducto.error || porVariante.error) {
      return { data: null, error: "No se pudo calcular el delta." };
    }

    const unicos = new Set<string>();
    for (const p of porProducto.data ?? []) unicos.add(p.id as string);
    for (const v of porVariante.data ?? []) {
      if (v.producto_id) unicos.add(v.producto_id as string);
    }
    ids = [...unicos];
  }

  // ── Los productos, con el MISMO shape que el catálogo completo ─────────
  // Comparten `COLUMNAS_CATALOGO_PANEL` a propósito: si el delta trajera una
  // forma distinta, el merge dejaría filas de dos formas en la copia local y
  // la pantalla mostraría cosas distintas según cómo llegó cada producto.
  let filas: unknown[] = [];

  if (ids === null) {
    // Modo completo: sin `.in()`, paginado normal.
    const res = await traerTodo("catálogo completo (delta)", (d, h) =>
      supabase
        .from("productos")
        .select(COLUMNAS_CATALOGO_PANEL, { count: "exact" })
        .order("creado_en", { ascending: false })
        .range(d, h),
    );
    if (res.error)
      return { data: null, error: "No se pudo cargar el catálogo." };
    filas = res.data;
  } else if (ids.length > 0) {
    // EN LOTES, y no por prolijidad: `.in()` viaja en la URL, así que con
    // miles de ids el servidor la rechaza por longitud. Es el mismo tope con
    // el que ya se topó `cargar-catalogo-import.ts` y por eso batchea de a
    // 200. Acá el delta típico son decenas de ids, pero el que importa es el
    // día raro —una importación, un ajuste masivo de precios— que es
    // justamente cuando esto se rompería.
    for (let i = 0; i < ids.length; i += TAMANO_LOTE_IN) {
      const lote = ids.slice(i, i + TAMANO_LOTE_IN);
      const res = await traerTodo("delta de catálogo", (d, h) =>
        supabase
          .from("productos")
          .select(COLUMNAS_CATALOGO_PANEL, { count: "exact" })
          .in("id", lote)
          .order("creado_en", { ascending: false })
          .range(d, h),
      );
      if (res.error) {
        return { data: null, error: "No se pudo cargar el catálogo." };
      }
      filas = filas.concat(res.data);
    }
  }

  const productosRes = { data: filas, error: null as string | null };

  // ── Bajas ──────────────────────────────────────────────────────────────
  // En el modo completo no hacen falta: la copia local se reemplaza entera.
  const borradosRes = demasiadoViejo
    ? { data: [] as { tabla: string; fila_id: string }[], error: null }
    : await supabase
        .from("catalogo_borrados")
        .select("tabla, fila_id")
        .gt("borrado_en", desde!.toISOString());

  const [reservasRes, resto] = await Promise.all([
    supabase.from("reservas").select("variante_id").eq("estado", "ACTIVA"),
    leerRestoCatalogo(supabase),
  ]);

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
    data: {
      resto,
      productos,
      borrados: (borradosRes.data ?? []) as {
        tabla: string;
        fila_id: string;
      }[],
      reservasPorVariante,
      cursor: cursorNuevo,
      completo: demasiadoViejo,
    },
    error: null,
  };
}
