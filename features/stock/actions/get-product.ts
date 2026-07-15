"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { Producto } from "@/entities/productos/types";
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
        *,
        categoria:categorias(id, nombre, slug),
        producto_variantes(
          *,
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
    const productos = (data as Producto[]).map((p) => ({
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
