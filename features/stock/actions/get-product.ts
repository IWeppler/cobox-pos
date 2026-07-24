"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Producto, ProductoIndice } from "@/entities/productos/types";
import {
  anotarStockDisponible,
  contarReservasActivasPorVariante,
} from "@/entities/productos/lib/stock-disponible";

export async function getStockAction(): Promise<{
  data: Producto[] | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const [{ data, error }, { data: reservasActivas }] = await Promise.all([
      supabase
        .from("productos")
        .select(
          `
        id, nombre, tipo, precio, precio_costo, imagen_url, thumbnail_url, slug, publicado, descripcion, categoria_id, creado_en,
        categoria:categorias(id, nombre, slug),
        producto_variantes(
          id, sku, nombre_display, precio, costo, stock, atributos,
          producto_variante_valores(
            atributo:atributos(nombre),
            atributo_valor:atributo_valores(valor)
          )
        ),
        stock:productos_stock(id, variante, cantidad)
        `,
        )
        .order("creado_en", { ascending: false }),
      supabase.from("reservas").select("variante_id").eq("estado", "ACTIVA"),
    ]);

    if (error) return { data: null, error: "Error al cargar." };

    const reservasPorVariante =
      contarReservasActivasPorVariante(reservasActivas);
    const productos = (data as unknown as Producto[]).map((p) => ({
      ...p,
      producto_variantes: anotarStockDisponible(
        p.producto_variantes,
        reservasPorVariante,
      ),
    }));

    return { data: productos, error: null };
  } catch (err) {
    console.error(err);
    return { data: null, error: "Ocurrió un error inesperado." };
  }
}

export async function getStockIndexAction(): Promise<{
  data: ProductoIndice[] | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
      .from("productos")
      .select(
        `
        id, nombre, tipo, precio, precio_costo, categoria_id,
        imagen_url, thumbnail_url, grid_url, slug, publicado,
        categoria:categorias(id, nombre, slug),
        producto_variantes(
          id, nombre_display, precio, costo, stock, atributos,
          producto_variante_valores(
            atributo:atributos(nombre),
            atributo_valor:atributo_valores(valor)
          )
        ),
        stock:productos_stock(cantidad)
        `,
      )
      .order("creado_en", { ascending: false });

    if (error) {
      console.error("[getStockIndexAction] Error:", error);
      return { data: null, error: "Error al cargar el índice de productos." };
    }

    return { data: data as unknown as ProductoIndice[], error: null };
  } catch (err) {
    console.error(err);
    return { data: null, error: "Ocurrió un error inesperado." };
  }
}

// Combina el índice de stock + config para la pantalla de Stock en un solo
// fetch client-side (React Query cachea esto con staleTime de 3 min).
export async function getStockPageDataAction(): Promise<{
  data: {
    productosIndice: ProductoIndice[];
    nombreComercio: string;
    mostrarSinStock: boolean;
  } | null;
  error: string | null;
}> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [result, configRes] = await Promise.all([
    getStockIndexAction(),
    supabase
      .from("configuracion_pos")
      .select("posName, mostrar_sin_stock")
      .single(),
  ]);

  if (result.error) {
    return { data: null, error: result.error };
  }

  return {
    data: {
      productosIndice: result.data ?? [],
      nombreComercio: configRes.data?.posName || "Tienda Online",
      mostrarSinStock: configRes.data?.mostrar_sin_stock ?? true,
    },
    error: null,
  };
}

// Detalle completo de UN producto — lo pide el sheet de edición al abrirse
// (ver ProductEditDetailSheet), nunca la lista: la tabla/grid de /stock
// rendeiza directo desde ProductoIndice, sin este fetch de por medio.
export async function getStockDetalleProductoAction(id: string): Promise<{
  data: Producto | null;
  error: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
      .from("productos")
      .select(
        `
        id, nombre, tipo, precio, precio_costo, imagen_url, thumbnail_url, grid_url, slug, publicado, descripcion, categoria_id, creado_en,
        categoria:categorias(id, nombre, slug),
        producto_variantes(
          id, sku, nombre_display, precio, costo, stock, atributos,
          producto_variante_valores(
            atributo:atributos(nombre),
            atributo_valor:atributo_valores(valor)
          )
        ),
        stock:productos_stock(id, variante, cantidad)
        `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[getStockDetalleProductoAction] Error:", error);
      return {
        data: null,
        error: "Error al cargar el detalle del producto.",
      };
    }

    return { data: data as unknown as Producto, error: null };
  } catch (err) {
    console.error(err);
    return { data: null, error: "Ocurrió un error inesperado." };
  }
}
