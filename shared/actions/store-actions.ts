"use server";

import { createPublicClient } from "@/shared/config/supabase/server";
import { Producto } from "@/entities/productos/types";
import {
  anotarStockDisponible,
  contarReservasActivasPorVariante,
} from "@/entities/productos/lib/stock-disponible";

export async function getProductosAction() {
  const supabase = await createPublicClient();

  const [{ data, error }, { data: reservasActivas }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        `
      id, nombre, tipo, categoria_id, precio, precio_costo, imagen_url, thumbnail_url, grid_url, slug, publicado,
      stock:productos_stock(id, variante, cantidad),
      producto_variantes(id, sku, nombre_display, precio, stock, atributos)
    `,
      )
      .eq("publicado", true)
      .eq("producto_variantes.activa", true)
      .order("creado_en", { ascending: false }),
    supabase.from("reservas").select("variante_id").eq("estado", "ACTIVA"),
  ]);

  if (error) {
    console.error("Error fetching public catalog:", error);
    return { data: null, error: "No se pudo cargar el catálogo." };
  }

  const reservasPorVariante = contarReservasActivasPorVariante(reservasActivas);
  const productos = (data as Producto[]).map((p) => ({
    ...p,
    producto_variantes: anotarStockDisponible(
      p.producto_variantes,
      reservasPorVariante,
    ),
  }));

  return { data: productos, error: null };
}

// Combina productos + categorías + config para la terminal VENDER en un
// solo fetch client-side (React Query cachea esto con staleTime de 3 min).
export async function getPosCatalogDataAction() {
  const supabase = await createPublicClient();

  const [productosRes, categoriasRes, configRes] = await Promise.all([
    getProductosAction(),
    supabase
      .from("categorias")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true }),
    supabase
      .from("configuracion_pos")
      .select("permitir_venta_sin_stock, posName, mostrar_sin_stock")
      .single(),
  ]);

  if (productosRes.error) {
    return { data: null, error: productosRes.error };
  }

  return {
    data: {
      productos: productosRes.data ?? [],
      categorias: categoriasRes.data ?? [],
      permitirVentaSinStock: configRes.data?.permitir_venta_sin_stock ?? false,
      nombreComercio: configRes.data?.posName || "Tienda Online",
      mostrarSinStock: configRes.data?.mostrar_sin_stock ?? true,
    },
    error: null,
  };
}

// 2. Obtener un producto usando su URL amigable (slug)
export async function getProductoBySlugAction(slug: string) {
  const supabase = await createPublicClient();

  const { data, error } = await supabase
    .from("productos")
    .select(
      `
      *,
      stock:productos_stock(id, variante, cantidad),
      producto_variantes(id, sku, nombre_display, precio, stock, atributos)
    `,
    )
    .eq("slug", slug)
    .eq("publicado", true)
    .eq("producto_variantes.activa", true)
    .single();

  if (error) {
    console.error(`Error fetching producto by slug (${slug}):`, error);
    return { data: null, error: "No se encontró el producto solicitado." };
  }

  const varianteIds = (data.producto_variantes ?? []).map(
    (v: { id: string }) => v.id,
  );
  const { data: reservasActivas } =
    varianteIds.length > 0
      ? await supabase
          .from("reservas")
          .select("variante_id")
          .eq("estado", "ACTIVA")
          .in("variante_id", varianteIds)
      : { data: [] };

  const reservasPorVariante = contarReservasActivasPorVariante(reservasActivas);
  const producto: Producto = {
    ...(data as Producto),
    producto_variantes: anotarStockDisponible(
      data.producto_variantes,
      reservasPorVariante,
    ),
  };

  return { data: producto, error: null };
}
