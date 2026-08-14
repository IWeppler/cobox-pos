"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ItemResuelto, SugerenciaSimilitud } from "@/entities/compras/types";
import { slugify } from "@/shared/utils/slugify";
import { traerTodo } from "@/shared/lib/traer-todo";
import {
  resolverAudienciaCategoria,
  type CategoriaReal,
} from "../lib/resolve-import-categoria";
import { parseAttributeSegment } from "@/entities/productos/lib/parse-variant-attributes";
import {
  construirCacheAtributos,
  canonicalizarValores,
  type AtributoCache,
} from "@/features/stock/lib/normalize-atributo";

type SupabaseDb = ReturnType<typeof createClient>;

const NOMBRES_VARIANTE_UNICA = new Set(["unico", "único"]);

/**
 * Convierte el string crudo de variante (ej. "TALLE: S / COLOR: NEGRO") en
 * un objeto estructurado { Talle: "S", Color: "Negro" } para guardar en
 * `producto_variantes.atributos`, en vez de dejarlo vacío ({}).
 */
function parseVarianteAtributos(variante: string): Record<string, string> {
  const normalizado = variante.trim().toLowerCase();
  if (!normalizado || NOMBRES_VARIANTE_UNICA.has(normalizado)) {
    return {};
  }

  const segmentos = variante.split(" / ");
  const atributos: Record<string, string> = {};

  for (const segmento of segmentos) {
    const parsed = parseAttributeSegment(segmento);
    if (parsed) {
      atributos[parsed.nombre] = parsed.valor;
    }
  }

  return atributos;
}

type SupabaseActionError = {
  message?: string;
  details?: string | null;
  code?: string | null;
};

function formatSupabaseError(error: SupabaseActionError | null | undefined) {
  if (!error) return "Error desconocido";
  return [error.message, error.details, error.code].filter(Boolean).join(" | ");
}

function throwIfSupabaseError(
  context: string,
  error: SupabaseActionError | null | undefined,
) {
  if (!error) return;

  console.error(`[PURCHASE MERGE] ${context}:`, JSON.stringify(error, null, 2));
  throw new Error(`${context}: ${formatSupabaseError(error)}`);
}

// 1. Obtener los datos para la pantalla de Merge
export async function getOrdenParaMergeAction(ordenId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [ordenRes, itemsRes, productosRes, categoriasRes] = await Promise.all([
    supabase.from("ordenes_compra").select("*").eq("id", ordenId).single(),
    supabase.from("ordenes_items").select("*").eq("orden_id", ordenId),
    // Paginado: es el catálogo contra el que se sugieren los matches del
    // remito. Truncado al tope de PostgREST, lo que quedó afuera se ofrece como
    // "producto nuevo" y termina duplicado.
    traerTodo("merge: productos", (desde, hasta) =>
      supabase
        .from("productos")
        .select("id, nombre, precio, precio_costo, tipo", { count: "exact" })
        .eq("publicado", true)
        .range(desde, hasta),
    ),
    traerTodo("merge: categorías", (desde, hasta) =>
      supabase
        .from("categorias")
        .select("id, nombre, slug, parent_id", { count: "exact" })
        .range(desde, hasta),
    ),
  ]);

  if (ordenRes.error || !ordenRes.data) {
    return {
      error: ordenRes.error
        ? `Orden no encontrada: ${formatSupabaseError(ordenRes.error)}`
        : "Orden no encontrada.",
      orden: null,
      items: [],
      productos: [],
      sugerenciasSimilitud: [],
    };
  }

  if (itemsRes.error) {
    return {
      error: `No se pudieron leer los items del remito: ${formatSupabaseError(itemsRes.error)}`,
      orden: null,
      items: [],
      productos: [],
      sugerenciasSimilitud: [],
    };
  }

  if (productosRes.error) {
    return {
      error: `No se pudieron leer los productos para conciliar: ${productosRes.error}`,
      orden: null,
      items: [],
      productos: [],
      sugerenciasSimilitud: [],
    };
  }

  // Candidatos de "posible match" (similitud de texto) para los ítems sin
  // match exacto — batched en un solo RPC, no uno por fila. No es
  // bloqueante: si falla (extensión no disponible, timeout), la pantalla
  // sigue funcionando en modo "sin sugerencias" (todo queda Ambiguo) en vez
  // de romper toda la conciliación.
  const rawNombresDesconocidos = Array.from(
    new Set(
      (itemsRes.data || [])
        .filter((item) => item.estado_match === "DESCONOCIDO")
        .map((item) => item.raw_nombre),
    ),
  );

  let sugerenciasSimilitud: SugerenciaSimilitud[] = [];
  if (rawNombresDesconocidos.length > 0) {
    const { data: similaresData, error: similaresError } = await supabase.rpc(
      "sugerir_productos_similares",
      { p_raw_nombres: rawNombresDesconocidos },
    );

    if (similaresError) {
      console.error(
        "[PURCHASE MERGE] Error obteniendo sugerencias de similitud:",
        JSON.stringify(similaresError, null, 2),
      );
    } else {
      sugerenciasSimilitud = (similaresData as SugerenciaSimilitud[]) || [];
    }
  }

  // Filtro de audiencia/marca: la similitud de texto sola no distingue
  // "Remera Nene" de "Remera Beba" ni una marca de otra si comparten
  // palabras genéricas ("remera", "estampada"). Si la fila importada ya
  // resolvió categoría (raw_categoria_id) o trae marca, un candidato con
  // audiencia o marca CONOCIDA y DISTINTA se descarta directo — no
  // debería competir como "posible match". No bloqueante: si no hay
  // árbol de categorías disponible, sigue sin filtrar en vez de romper.
  if (sugerenciasSimilitud.length > 0 && !categoriasRes.error) {
    const categoriasReales: CategoriaReal[] = categoriasRes.data || [];
    const baselinePorRawNombre = new Map<
      string,
      { categoriaId: string | null; marca: string | null }
    >();
    for (const item of itemsRes.data || []) {
      if (baselinePorRawNombre.has(item.raw_nombre)) continue;
      baselinePorRawNombre.set(item.raw_nombre, {
        categoriaId: item.raw_categoria_id ?? null,
        marca: item.raw_marca ?? null,
      });
    }

    sugerenciasSimilitud = sugerenciasSimilitud.filter((s) => {
      const baseline = baselinePorRawNombre.get(s.raw_nombre);
      if (!baseline) return true;

      if (baseline.categoriaId && s.categoria_id) {
        const audienciaFila = resolverAudienciaCategoria(
          baseline.categoriaId,
          categoriasReales,
        );
        const audienciaCandidato = resolverAudienciaCategoria(
          s.categoria_id,
          categoriasReales,
        );
        if (
          audienciaFila &&
          audienciaCandidato &&
          audienciaFila !== audienciaCandidato
        ) {
          return false;
        }
      }

      if (baseline.marca && s.marca) {
        if (baseline.marca.trim().toLowerCase() !== s.marca.trim().toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  } else if (categoriasRes.error) {
    console.error(
      "[PURCHASE MERGE] Error obteniendo categorías para filtrar sugerencias:",
      JSON.stringify(categoriasRes.error, null, 2),
    );
  }

  return {
    error: null,
    orden: ordenRes.data,
    items: itemsRes.data || [],
    productos: productosRes.data || [],
    sugerenciasSimilitud,
  };
}

export async function crearProductoAlVueloAction(
  nombre: string,
  costo: number,
  precio: number,
  archivosMain: File[],
  archivosThumb: File[],
  archivosGrid: File[],
  categoriaId?: string,
  marca?: string,
  /** Copias de mayor calidad (1600px @0.9), para poder regenerar derivadas.
   * Va al final y opcional para no romper llamadas viejas, pero un producto
   * creado sin master es uno que no se va a poder reoptimizar nunca — ver la
   * migración 20260812140000. */
  archivosMaster: File[] = [],
) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autorizado." };

    // Las imágenes se guardan bajo la carpeta del negocio: es lo que la policy
    // de storage exige para poder escribir.
    const { data: negocioId } = await supabase.rpc("negocio_actual");
    if (!negocioId) return { error: "No hay un negocio activo en esta sesión." };

    const slug = `${slugify(nombre)}-${Math.random().toString(36).substring(2, 6)}`;
    let categoria_id: string | null = null;
    let categoriaTipoLabel = "General";

    // Se recibe el id directo (viene de un <Select> poblado desde
    // `categorias`, o del árbol resuelto en el import) — NUNCA se busca
    // por nombre acá. El árbol permite nombres repetidos bajo padres
    // distintos ("Remeras" en Ropa Mujer y en Ropa Niña), así que una
    // búsqueda por texto sería ambigua por diseño; un lookup por id de PK
    // no puede serlo. El SELECT solo valida que el id siga existiendo
    // (defensivo contra estado de cliente desactualizado), no busca nada.
    if (categoriaId) {
      const { data: catExistente, error: categoriaSelectError } = await supabase
        .from("categorias")
        .select("id, nombre")
        .eq("id", categoriaId)
        .maybeSingle();

      if (categoriaSelectError) {
        console.error("Error buscando categoria:", categoriaSelectError);
        return { error: "Error buscando la categoría del producto." };
      }

      if (!catExistente) {
        return {
          error:
            "La categoría seleccionada ya no existe. Elegí una categoría real antes de crear el producto.",
        };
      }

      categoria_id = catExistente.id;
      categoriaTipoLabel = catExistente.nombre;
    }

    // Subir imágenes Main, Thumbnail y Grid
    let imagen_url: string | null = null;
    let thumbnail_url: string | null = null;
    let grid_url: string | null = null;
    let master_url: string | null = null;
    const urlsMain: string[] = [];
    const urlsThumb: string[] = [];
    const urlsGrid: string[] = [];
    const urlsMaster: (string | null)[] = [];

    for (let i = 0; i < archivosMain.length; i++) {
      const fileMain = archivosMain[i];
      const fileThumb = archivosThumb[i];
      const fileGrid = archivosGrid[i];
      const fileMaster = archivosMaster[i];

      if (fileMain && fileMain.size > 0) {
        const fileExt = fileMain.name.split(".").pop();
        const baseFileName = crypto.randomUUID();

        // 1. Subir Main
        const mainName = `${negocioId}/${baseFileName}.${fileExt}`;
        const { error: uploadMainError } = await supabase.storage
          .from("productos")
          .upload(mainName, fileMain, { cacheControl: "31536000" });

        if (!uploadMainError) {
          const {
            data: { publicUrl: urlMain },
          } = supabase.storage.from("productos").getPublicUrl(mainName);
          urlsMain.push(urlMain);
        }

        // 2. Subir Thumbnail (si existe en el mismo índice)
        if (fileThumb && fileThumb.size > 0) {
          const thumbName = `${negocioId}/thumbs/${baseFileName}-thumb.${fileExt}`;
          const { error: uploadThumbError } = await supabase.storage
            .from("productos")
            .upload(thumbName, fileThumb, { cacheControl: "31536000" });

          if (!uploadThumbError) {
            const {
              data: { publicUrl: urlThumb },
            } = supabase.storage.from("productos").getPublicUrl(thumbName);
            urlsThumb.push(urlThumb);
          }
        }

        // 3. Subir Grid (si existe en el mismo índice)
        if (fileGrid && fileGrid.size > 0) {
          const gridName = `${negocioId}/grids/${baseFileName}-grid.${fileExt}`;
          const { error: uploadGridError } = await supabase.storage
            .from("productos")
            .upload(gridName, fileGrid, { cacheControl: "31536000" });

          if (!uploadGridError) {
            const {
              data: { publicUrl: urlGrid },
            } = supabase.storage.from("productos").getPublicUrl(gridName);
            urlsGrid.push(urlGrid);
          }
        }

        // 4. Subir Master — la copia desde la que se van a poder regenerar las
        // otras tres. Si falla se guarda `null` y NO se cae al main: decir que
        // hay master cuando no lo hay haría que una futura reoptimización
        // recomprima desde una copia ya degradada.
        let urlMaster: string | null = null;
        if (fileMaster && fileMaster.size > 0) {
          const masterName = `${negocioId}/masters/${baseFileName}-master.${fileMaster.name.split(".").pop()}`;
          const { error: uploadMasterError } = await supabase.storage
            .from("productos")
            .upload(masterName, fileMaster, { cacheControl: "31536000" });

          if (uploadMasterError) {
            console.error("[MERGE MASTER ERROR]", {
              archivo: fileMain.name,
              indice: i,
              error: uploadMasterError,
            });
          } else {
            urlMaster = supabase.storage
              .from("productos")
              .getPublicUrl(masterName).data.publicUrl;
          }
        }
        urlsMaster.push(urlMaster);
      }
    }

    if (urlsMain.length > 0) imagen_url = JSON.stringify(urlsMain);
    if (urlsThumb.length > 0) thumbnail_url = JSON.stringify(urlsThumb);
    if (urlsGrid.length > 0) grid_url = JSON.stringify(urlsGrid);
    if (urlsMaster.some(Boolean)) master_url = JSON.stringify(urlsMaster);

    const { data: nuevoProducto, error } = await supabase
      .from("productos")
      .insert({
        nombre,
        precio_costo: costo || 0,
        precio: precio || 0,
        slug,
        tipo: categoriaTipoLabel,
        categoria_id: categoria_id,
        marca: marca?.trim() || null,
        publicado: true,
        atributos_globales: {},
        imagen_url,
        master_url,
        thumbnail_url,
        grid_url,
      })
      .select("*")
      .single();

    if (error || !nuevoProducto) {
      console.error("Error creando producto al vuelo:", error);
      return { error: "Error de BD al crear." };
    }

    return { success: true, producto: nuevoProducto };
  } catch (error) {
    console.error("Error interno al crear el producto:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Error interno al crear el producto.",
    };
  }
}

// 2. Aprobar e Impactar la Orden en la BD (Agrupada y Optimizada)
export async function aprobarOrdenAction(
  ordenId: string,
  proveedor: string,
  itemsResueltos: ItemResuelto[],
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  try {
    // Un solo barrido para juntar todos los valores de atributo del remito y
    // resolver el cache de canonicalización de una sola vez.
    const valoresPorPropiedad: Record<string, Set<string>> = {};
    for (const item of itemsResueltos) {
      if (!item.producto_id) continue;
      const variante = item.variante_match || item.raw_variante || "Unico";
      const atributosRaw = parseVarianteAtributos(variante);
      Object.entries(atributosRaw).forEach(([nombre, valor]) => {
        if (!valoresPorPropiedad[nombre])
          valoresPorPropiedad[nombre] = new Set();
        valoresPorPropiedad[nombre].add(valor);
      });
    }
    const opcionesAtributos = Object.entries(valoresPorPropiedad).map(
      ([nombre, valores]) => ({ nombre, valores: Array.from(valores) }),
    );
    const atributoCache = await construirCacheAtributos(
      supabase,
      opcionesAtributos,
    );

    // El ciclo completo (precios + stock + alias + estado de la orden) corre
    // dentro de la RPC `aprobar_orden_compra`, en UNA transacción. Antes esto
    // era un for con await adentro: 4 round-trips por línea, ~1500 en el
    // remito más grande real (347 líneas) — de ahí el timeout de 300s.
    //
    // La canonicalización de atributos se queda acá a propósito: es la misma
    // que usa la creación manual de productos, y no se duplica en SQL. La
    // RPC recibe `atributos` ya canonicalizado.
    const itemsPayload = itemsResueltos
      .filter((item) => item.producto_id)
      .map((item) => {
        const variante = item.variante_match || item.raw_variante || "Unico";
        return {
          // Con esto la RPC puede escribir en la línea del remito a qué
          // producto fue. Sin `item_id`, `ordenes_items.producto_id` quedaba
          // null aunque el stock hubiera entrado, y el ingreso desaparecía del
          // historial de Movimientos de Stock.
          item_id: item.id ?? null,
          producto_id: item.producto_id,
          raw_nombre: item.raw_nombre,
          estado_match: item.estado_match,
          variante,
          atributos: canonicalizarValores(
            parseVarianteAtributos(variante),
            atributoCache,
          ),
          sku: item.raw_sku?.trim() || null,
          // Si la línea trae número de serie, la RPC crea la unidad en
          // `unidades_serie`. Es lo que permite que una planilla de electro
          // entre por conciliación sin perder los IMEI.
          imei: item.raw_imei?.trim() || null,
          cantidad: item.cantidad,
          precio_costo: item.precio_costo ?? null,
          precio_venta_actualizado: item.precio_venta_actualizado ?? null,
        };
      });

    const { data: resultado, error: aprobarError } = await supabase.rpc(
      "aprobar_orden_compra",
      {
        p_orden_id: ordenId,
        p_proveedor: proveedor,
        p_items: itemsPayload,
      },
    );

    throwIfSupabaseError("Error impactando la orden", aprobarError);

    // La RPC es idempotente: si la orden ya estaba aprobada no tocó nada y
    // avisa por acá. NO es un error — es el resultado correcto de una
    // segunda aprobación (doble click, pestaña vieja, reintento después de
    // un timeout que en realidad había impactado). El cliente lo usa para
    // no ofrecer "Reintentar" sobre algo que ya está hecho.
    const yaAprobada =
      (resultado as { ya_aprobada?: boolean } | null)?.ya_aprobada === true;

    revalidatePath("/stock");
    revalidatePath("/compras");

    return { success: true, yaAprobada };
  } catch (error) {
    console.error("Error al aprobar orden:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Hubo un error al impactar los datos en el sistema.",
    };
  }
}
