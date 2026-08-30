"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";

export type ResultadoProducto = {
  id: string;
  nombre: string;
  precio: number;
  categoria: string | null;
};

export type ResultadoCliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  saldo: number;
};

export type ResultadosBusquedaGlobal = {
  productos: ResultadoProducto[];
  clientes: ResultadoCliente[];
};

/** Con menos que esto la búsqueda trae medio catálogo y no ayuda a nadie. */
const MINIMO_CARACTERES = 2;
const TOPE_PRODUCTOS = 8;
const TOPE_CLIENTES = 6;

/**
 * Los caracteres que rompen un patrón de PostgREST.
 *
 * `%` y `_` son comodines de LIKE: sin escaparlos, tipear "50%" busca
 * cualquier cosa. La coma y los paréntesis son separadores de la sintaxis de
 * `.or(...)`, así que un nombre con coma —"REMERAS, BLUSAS"— arma un filtro
 * distinto del que se quiso. Se limpian en vez de escaparse: en un buscador,
 * ignorar un carácter raro es mejor que devolver resultados equivocados.
 */
function limpiarPatron(texto: string): string {
  return texto.replace(/[%_,()\\]/g, " ").trim();
}

/**
 * Búsqueda de la paleta (Ctrl+K): productos y clientes en UN viaje.
 *
 * Va al server y no al catálogo que el POS ya tiene en memoria a propósito: la
 * paleta se abre desde cualquier pantalla —Caja, Ventas, Configuración— y
 * traerse los 994 productos de un negocio para buscar desde /caja es peor que
 * una consulta con `limit`. Donde el catálogo ya está cargado, la diferencia
 * es un viaje que igual está debounceado.
 *
 * El aislamiento por negocio lo da la RLS, como siempre: acá no hay filtro por
 * `negocio_id` porque la policy ya lo aplica.
 */
export async function buscarGlobalAction(
  consulta: string,
): Promise<ResultadosBusquedaGlobal> {
  const patron = limpiarPatron(consulta);

  if (patron.length < MINIMO_CARACTERES) {
    return { productos: [], clientes: [] };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: productos }, { data: clientes }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, precio, tipo")
      .or(`nombre.ilike.%${patron}%,modelo.ilike.%${patron}%`)
      .order("nombre")
      .limit(TOPE_PRODUCTOS),
    supabase
      .from("clientes")
      .select("id, nombre, telefono, saldo_pendiente")
      .eq("activo", true)
      .or(`nombre.ilike.%${patron}%,telefono.ilike.%${patron}%`)
      .order("nombre")
      .limit(TOPE_CLIENTES),
  ]);

  return {
    productos: (productos ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio ?? 0),
      categoria: p.tipo ?? null,
    })),
    clientes: (clientes ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      saldo: Number(c.saldo_pendiente ?? 0),
    })),
  };
}
