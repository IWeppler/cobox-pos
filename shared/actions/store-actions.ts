"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Producto } from "@/entities/productos/types";

export async function getProductosAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("productos")
    .select(
      `
      *,
      stock:productos_stock(id, variante, cantidad),
      producto_variantes(id, nombre_display, precio, stock, atributos)
    `,
    )
    .eq("publicado", true)
    .order("creado_en", { ascending: false });

  if (error) {
    console.error("Error fetching public catalog:", error);
    return { data: null, error: "No se pudo cargar el catálogo." };
  }

  return { data: data as Producto[], error: null };
}

// 2. Obtener un producto usando su URL amigable (slug)
export async function getProductoBySlugAction(slug: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("productos")
    .select(
      `
      *,
      stock:productos_stock(id, variante, cantidad),
      producto_variantes(id, nombre_display, precio, stock, atributos)
    `,
    )
    .eq("slug", slug)
    .eq("publicado", true)
    .single();

  if (error) {
    console.error(`Error fetching producto by slug (${slug}):`, error);
    return { data: null, error: "No se encontró el producto solicitado." };
  }

  return { data: data as Producto, error: null };
}
