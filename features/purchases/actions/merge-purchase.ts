"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ItemResuelto } from "@/entities/compras/types";
import { slugify } from "@/shared/utils/slugify";

type SupabaseDb = ReturnType<typeof createClient>;

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

  // Si hay error, devolvemos la misma estructura pero con datos nulos/vacíos
  if (ordenRes.error || !ordenRes.data) {
    return {
      error: "Orden no encontrada.",
      orden: null,
      items: [],
      productos: [],
    };
  }

  // Si todo está bien, devolvemos los datos y error en null
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
  categoriaNombre?: string,
) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autorizado." };

    const slug =
      nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
      "-" +
      Math.random().toString(36).substring(2, 6);
    let categoria_id = null;

    // Si viene la categoría del Excel, la buscamos o la creamos
    if (categoriaNombre) {
      // Intentamos buscarla
      const { data: catExistente } = await supabase
        .from("categorias")
        .select("id")
        .ilike("nombre", categoriaNombre.trim())
        .maybeSingle();

      if (catExistente) {
        categoria_id = catExistente.id;
      } else {
        // La creamos
        const { data: nuevaCat } = await supabase
          .from("categorias")
          .insert({
            nombre: categoriaNombre.trim(),
            slug: categoriaNombre
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-"),
            activa: true,
          })
          .select("id")
          .single();
        if (nuevaCat) categoria_id = nuevaCat.id;
      }
    }

    const { data: nuevoProducto, error } = await supabase
      .from("productos")
      .insert({
        nombre,
        precio_costo: costo || 0,
        precio: precio || 0,
        slug,
        tipo: categoriaNombre || "General",
        categoria_id: categoria_id,
        publicado: true,
        atributos_globales: {},
      })
      .select("*")
      .single();

    if (error || !nuevoProducto) return { error: "Error de BD al crear." };

    return { success: true, producto: nuevoProducto };
  } catch (error) {
    return { error: "Error interno al crear el producto." };
  }
}

async function actualizarPrecios(item: ItemResuelto, supabase: SupabaseDb) {
  if (!item.precio_venta_actualizado && !item.precio_costo) return;

  const updateData: { precio_costo?: number; precio?: number } = {};

  if (item.precio_costo) updateData.precio_costo = item.precio_costo;
  if (item.precio_venta_actualizado)
    updateData.precio = item.precio_venta_actualizado;

  await supabase
    .from("productos")
    .update(updateData)
    .eq("id", item.producto_id);
}

async function actualizarStock(item: ItemResuelto, supabase: SupabaseDb) {
  const { data: stockExistente } = await supabase
    .from("productos_stock")
    .select("id, cantidad")
    .eq("producto_id", item.producto_id)
    .eq("variante", item.variante_match)
    .single();

  if (stockExistente) {
    await supabase
      .from("productos_stock")
      .update({ cantidad: stockExistente.cantidad + item.cantidad })
      .eq("id", stockExistente.id);
  } else {
    await supabase.from("productos_stock").insert({
      producto_id: item.producto_id,
      variante: item.variante_match,
      cantidad: item.cantidad,
    });
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
    await supabase.from("diccionario_alias").upsert(
      {
        proveedor,
        raw_nombre: item.raw_nombre.trim().toLowerCase(),
        producto_id: item.producto_id,
      },
      { onConflict: "proveedor, raw_nombre" },
    );
  }
}

// 2. Aprobar e Impactar la Orden en la BD (Completamente Tipado)
export async function aprobarOrdenAction(
  ordenId: string,
  proveedor: string,
  itemsResueltos: ItemResuelto[],
) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  try {
    for (const item of itemsResueltos) {
      if (!item.producto_id) continue;

      // Código súper limpio y fácil de leer
      await actualizarPrecios(item, supabase);
      await actualizarStock(item, supabase);
      await registrarAliasDiccionario(item, proveedor, supabase);
    }

    await supabase
      .from("ordenes_compra")
      .update({ estado: "APROBADA" })
      .eq("id", ordenId);

    revalidatePath("/stock");
    revalidatePath("/compras");

    return { success: true };
  } catch (error) {
    console.error("Error al aprobar orden:", error);
    return { error: "Hubo un error al impactar los datos en el sistema." };
  }
}
