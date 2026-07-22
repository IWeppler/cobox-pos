"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ItemResuelto } from "@/entities/compras/types";
import { slugify } from "@/shared/utils/slugify";
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

  const [ordenRes, itemsRes, productosRes] = await Promise.all([
    supabase.from("ordenes_compra").select("*").eq("id", ordenId).single(),
    supabase.from("ordenes_items").select("*").eq("orden_id", ordenId),
    supabase
      .from("productos")
      .select("id, nombre, precio, precio_costo, tipo")
      .eq("publicado", true),
  ]);

  if (ordenRes.error || !ordenRes.data) {
    return {
      error: ordenRes.error
        ? `Orden no encontrada: ${formatSupabaseError(ordenRes.error)}`
        : "Orden no encontrada.",
      orden: null,
      items: [],
      productos: [],
    };
  }

  if (itemsRes.error) {
    return {
      error: `No se pudieron leer los items del remito: ${formatSupabaseError(itemsRes.error)}`,
      orden: null,
      items: [],
      productos: [],
    };
  }

  if (productosRes.error) {
    return {
      error: `No se pudieron leer los productos para conciliar: ${formatSupabaseError(productosRes.error)}`,
      orden: null,
      items: [],
      productos: [],
    };
  }

  return {
    error: null,
    orden: ordenRes.data,
    items: itemsRes.data || [],
    productos: productosRes.data || [],
  };
}

export async function crearProductoAlVueloAction(
  nombre: string,
  costo: number,
  precio: number,
  archivosMain: File[],
  archivosThumb: File[],
  archivosGrid: File[],
  categoriaNombre?: string,
) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autorizado." };

    const slug = `${slugify(nombre)}-${Math.random().toString(36).substring(2, 6)}`;
    let categoria_id = null;
    const categoriaLimpia = categoriaNombre?.trim();

    // Si viene la categoría del Excel, la buscamos o la creamos
    if (categoriaLimpia) {
      const { data: catExistente, error: categoriaSelectError } = await supabase
        .from("categorias")
        .select("id")
        .ilike("nombre", categoriaLimpia)
        .maybeSingle();

      if (categoriaSelectError) {
        console.error("Error buscando categoria:", categoriaSelectError);
        return { error: "Error buscando la categoría del producto." };
      }

      if (catExistente) {
        categoria_id = catExistente.id;
      } else {
        const { data: nuevaCat, error: categoriaInsertError } = await supabase
          .from("categorias")
          .insert({
            nombre: categoriaLimpia,
            slug: slugify(categoriaLimpia),
            activa: true,
          })
          .select("id")
          .single();

        if (categoriaInsertError) {
          console.error("Error creando categoria:", categoriaInsertError);
          return { error: "Error creando la categoría del producto." };
        }

        if (nuevaCat) categoria_id = nuevaCat.id;
      }
    }

    // Subir imágenes Main, Thumbnail y Grid
    let imagen_url: string | null = null;
    let thumbnail_url: string | null = null;
    let grid_url: string | null = null;
    const urlsMain: string[] = [];
    const urlsThumb: string[] = [];
    const urlsGrid: string[] = [];

    for (let i = 0; i < archivosMain.length; i++) {
      const fileMain = archivosMain[i];
      const fileThumb = archivosThumb[i];
      const fileGrid = archivosGrid[i];

      if (fileMain && fileMain.size > 0) {
        const fileExt = fileMain.name.split(".").pop();
        const baseFileName = crypto.randomUUID();

        // 1. Subir Main
        const mainName = `${baseFileName}.${fileExt}`;
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
          const thumbName = `thumbs/${baseFileName}-thumb.${fileExt}`;
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
          const gridName = `grids/${baseFileName}-grid.${fileExt}`;
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
      }
    }

    if (urlsMain.length > 0) imagen_url = JSON.stringify(urlsMain);
    if (urlsThumb.length > 0) thumbnail_url = JSON.stringify(urlsThumb);
    if (urlsGrid.length > 0) grid_url = JSON.stringify(urlsGrid);

    const { data: nuevoProducto, error } = await supabase
      .from("productos")
      .insert({
        nombre,
        precio_costo: costo || 0,
        precio: precio || 0,
        slug,
        tipo: categoriaLimpia || "General",
        categoria_id: categoria_id,
        publicado: true,
        atributos_globales: {},
        imagen_url,
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

async function actualizarPrecios(item: ItemResuelto, supabase: SupabaseDb) {
  if (!item.precio_venta_actualizado && !item.precio_costo) return;

  const updateData: { precio_costo?: number; precio?: number } = {};

  if (item.precio_costo) updateData.precio_costo = item.precio_costo;
  if (item.precio_venta_actualizado)
    updateData.precio = item.precio_venta_actualizado;

  const { error } = await supabase
    .from("productos")
    .update(updateData)
    .eq("id", item.producto_id);

  throwIfSupabaseError(
    `Error actualizando precios de ${item.raw_nombre}`,
    error,
  );
}

async function actualizarStock(
  item: ItemResuelto,
  supabase: SupabaseDb,
  precioBaseProducto: number,
  atributoCache: AtributoCache,
) {
  if (!item.producto_id) return;

  const variante = item.variante_match || item.raw_variante || "Unico";
  const atributosRaw = parseVarianteAtributos(variante);
  const atributos = canonicalizarValores(atributosRaw, atributoCache);

  const { data: varianteExistente, error: varianteSelectError } = await supabase
    .from("producto_variantes")
    .select("id, stock")
    .eq("producto_id", item.producto_id)
    .eq("nombre_display", variante)
    .maybeSingle();

  throwIfSupabaseError(
    `Error buscando variante ${variante} de ${item.raw_nombre}`,
    varianteSelectError,
  );

  if (varianteExistente) {
    const { error: varianteUpdateError } = await supabase
      .from("producto_variantes")
      .update({
        stock: Number(varianteExistente.stock || 0) + item.cantidad,
        atributos,
      })
      .eq("id", varianteExistente.id);

    throwIfSupabaseError(
      `Error actualizando variante ${variante} de ${item.raw_nombre}`,
      varianteUpdateError,
    );
  } else {
    const difierePrecio =
      (item.precio_venta_actualizado || 0) !== precioBaseProducto;

    const { error: varianteInsertError } = await supabase
      .from("producto_variantes")
      .insert({
        producto_id: item.producto_id,
        nombre_display: variante,
        atributos,
        precio: difierePrecio ? (item.precio_venta_actualizado ?? null) : null,
        costo: difierePrecio ? item.precio_costo : null,
        stock: item.cantidad,
      });

    throwIfSupabaseError(
      `Error creando variante ${variante} de ${item.raw_nombre}`,
      varianteInsertError,
    );
  }

  const { data: stockExistente, error: stockSelectError } = await supabase
    .from("productos_stock")
    .select("id, cantidad")
    .eq("producto_id", item.producto_id)
    .eq("variante", variante)
    .maybeSingle();

  throwIfSupabaseError(
    `Error buscando stock ${variante} de ${item.raw_nombre}`,
    stockSelectError,
  );

  if (stockExistente) {
    const { error: stockUpdateError } = await supabase
      .from("productos_stock")
      .update({
        cantidad: Number(stockExistente.cantidad || 0) + item.cantidad,
      })
      .eq("id", stockExistente.id);

    throwIfSupabaseError(
      `Error actualizando stock ${variante} de ${item.raw_nombre}`,
      stockUpdateError,
    );
  } else {
    const { error: stockInsertError } = await supabase
      .from("productos_stock")
      .insert({
        producto_id: item.producto_id,
        variante,
        cantidad: item.cantidad,
      });

    throwIfSupabaseError(
      `Error creando stock ${variante} de ${item.raw_nombre}`,
      stockInsertError,
    );
  }
}

async function registrarAliasDiccionario(
  item: ItemResuelto,
  proveedor: string,
  supabase: SupabaseDb,
) {
  if (
    item.estado_match === "DESCONOCIDO" ||
    item.estado_match === "NUEVO_ALIAS"
  ) {
    const { error } = await supabase.from("diccionario_alias").upsert(
      {
        proveedor,
        raw_nombre: item.raw_nombre.trim().toLowerCase(),
        producto_id: item.producto_id,
      },
      { onConflict: "proveedor, raw_nombre" },
    );

    throwIfSupabaseError(`Error registrando alias ${item.raw_nombre}`, error);
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
    // Sets de control para evitar golpear la DB repetidas veces por el mismo producto padre
    const productosActualizados = new Set<string>();
    const aliasRegistrados = new Set<string>();
    // Precio unificado que efectivamente se escribió a nivel producto, por
    // producto_id — referencia para saber si una variante puntual difiere.
    const precioBasePorProducto = new Map<string, number>();
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

    for (const item of itemsResueltos) {
      if (!item.producto_id) continue;

      // 1. Actualizar precios (Solo se hace 1 vez por Producto, aunque tenga 10 variantes)
      if (!productosActualizados.has(item.producto_id)) {
        await actualizarPrecios(item, supabase);
        productosActualizados.add(item.producto_id);
        precioBasePorProducto.set(
          item.producto_id,
          item.precio_venta_actualizado || 0,
        );
      }

      // 2. Actualizar stock (Se ejecuta siempre, por CADA variante individual)
      await actualizarStock(
        item,
        supabase,
        precioBasePorProducto.get(item.producto_id) ?? 0,
        atributoCache,
      );

      // 3. Registrar Alias en el Diccionario (Solo 1 vez por nombre crudo)
      const aliasKey = item.raw_nombre.trim().toLowerCase();
      if (!aliasRegistrados.has(aliasKey)) {
        await registrarAliasDiccionario(item, proveedor, supabase);
        aliasRegistrados.add(aliasKey);
      }
    }

    const { error: ordenUpdateError } = await supabase
      .from("ordenes_compra")
      .update({ estado: "APROBADA" })
      .eq("id", ordenId);

    throwIfSupabaseError(
      "Error marcando orden como aprobada",
      ordenUpdateError,
    );

    revalidatePath("/stock");
    revalidatePath("/compras");

    return { success: true };
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
