"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  calcularStockDisponible,
  contarReservasActivasPorVariante,
} from "@/entities/productos/lib/stock-disponible";

interface ReservaActionResult {
  error: string | null;
  success: boolean;
}

export interface ReservaItemInput {
  productoId: string;
  varianteId: string | undefined;
  cantidad: number;
}

// Crea 1 fila por unidad reservada — `reservas` no tiene columna `cantidad`
// a propósito: cada fila referencia una unidad física puntual.
export async function crearReservaAction(
  clienteId: string,
  items: ReservaItemInput[],
  nota?: string,
): Promise<ReservaActionResult> {
  if (!clienteId) {
    return { error: "Selecciona un cliente para reservar.", success: false };
  }
  if (!items.length) {
    return { error: "No hay productos para reservar.", success: false };
  }
  if (items.some((item) => !item.varianteId)) {
    return {
      error:
        "Alguno de los productos no tiene una variante registrada y no se puede reservar. Volvé a guardarlo desde Inventario antes de reservarlo.",
      success: false,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sumamos por variante por si el carrito trae más de una línea para la
  // misma variante (no debería pasar — el carrito las mergea — pero no
  // confiamos en eso acá).
  const cantidadPedidaPorVariante: Record<string, number> = {};
  for (const item of items) {
    const varianteId = item.varianteId as string;
    cantidadPedidaPorVariante[varianteId] =
      (cantidadPedidaPorVariante[varianteId] || 0) +
      Math.max(1, Math.floor(item.cantidad));
  }
  const varianteIds = Object.keys(cantidadPedidaPorVariante);

  // Validamos contra el stock REAL en base, no contra lo que haya
  // calculado el cliente — puede estar desactualizado (otra pestaña, otra
  // reserva creada en el medio, etc.).
  const [{ data: variantes }, { data: reservasActivas }] = await Promise.all([
    supabase
      .from("producto_variantes")
      .select("id, nombre_display, stock")
      .in("id", varianteIds),
    supabase
      .from("reservas")
      .select("variante_id")
      .eq("estado", "ACTIVA")
      .in("variante_id", varianteIds),
  ]);

  const variantesEncontradas = new Set((variantes ?? []).map((v) => v.id));
  const varianteFaltante = varianteIds.find(
    (id) => !variantesEncontradas.has(id),
  );
  if (varianteFaltante) {
    return {
      error: "Alguna de las variantes ya no existe en el catálogo.",
      success: false,
    };
  }

  const reservasPorVariante = contarReservasActivasPorVariante(reservasActivas);
  for (const variante of variantes ?? []) {
    const disponible = calcularStockDisponible(
      variante.stock,
      variante.id,
      reservasPorVariante,
    );
    const pedida = cantidadPedidaPorVariante[variante.id] || 0;
    if (pedida > disponible) {
      return {
        error: `No hay stock disponible suficiente de "${variante.nombre_display}" para reservar (disponible: ${disponible}, pedido: ${pedida}).`,
        success: false,
      };
    }
  }

  const filas = items.flatMap((item) =>
    Array.from({ length: Math.max(1, Math.floor(item.cantidad)) }, () => ({
      producto_id: item.productoId,
      variante_id: item.varianteId as string,
      cliente_id: clienteId,
      nota: nota || null,
      estado: "ACTIVA",
      creado_por: user?.id ?? null,
    })),
  );

  const { error } = await supabase.from("reservas").insert(filas);

  if (error) {
    console.error("[CREAR RESERVA ERROR]", error);
    return { error: "No se pudo registrar la reserva.", success: false };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/reservas");
  revalidatePath("/pos");
  revalidatePath("/", "layout");

  return { error: null, success: true };
}

export async function listarReservasActivasAction() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("reservas")
    .select(
      `
      id,
      nota,
      estado,
      creado_en,
      producto:productos(id, nombre, precio),
      variante:producto_variantes(id, nombre_display, precio),
      cliente:clientes(id, nombre, telefono)
      `,
    )
    .eq("estado", "ACTIVA")
    .order("creado_en", { ascending: false });

  if (error) {
    console.error("[LISTAR RESERVAS ERROR]", error);
    return { data: null, error: "No se pudieron cargar las reservas." };
  }

  return { data, error: null };
}

export async function devolverReservaAction(
  reservaId: string,
): Promise<ReservaActionResult> {
  if (!reservaId) return { error: "Reserva inválida.", success: false };

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from("reservas")
    .update({ estado: "DEVUELTA", resuelto_en: new Date().toISOString() })
    .eq("id", reservaId)
    .eq("estado", "ACTIVA");

  if (error) {
    console.error("[DEVOLVER RESERVA ERROR]", error);
    return { error: "No se pudo devolver la reserva a stock.", success: false };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/reservas");
  revalidatePath("/pos");
  revalidatePath("/", "layout");

  return { error: null, success: true };
}
