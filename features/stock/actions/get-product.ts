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

export async function getStockPageDetailAction(ids: string[]): Promise<{
  data: Producto[] | null;
  error: string | null;
}> {
  if (ids.length === 0) return { data: [], error: null };

  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
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
      .in("id", ids);

    if (error) {
      console.error("[getStockPageDetailAction] Error:", error);
      return {
        data: null,
        error: "Error al cargar el detalle de los productos.",
      };
    }

    const porId = new Map(
      (data as unknown as Producto[]).map((p) => [p.id, p]),
    );
    const productos = ids
      .map((id) => porId.get(id))
      .filter((p): p is Producto => p !== undefined);

    return { data: productos, error: null };
  } catch (err) {
    console.error(err);
    return { data: null, error: "Ocurrió un error inesperado." };
  }
}
