"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import {
  buscarDuplicado,
  mensajeDeDuplicado,
  type NivelDuplicado,
} from "../lib/duplicado-de-producto";

/**
 * Si ya existe un producto así, antes de crearlo.
 *
 * La consulta trae los homónimos por nombre y la DECISIÓN la toma
 * `duplicado-de-producto.ts`, que tiene tests: qué cuenta como duplicado —
 * nombre + categoría + marca, no solo el nombre— es una regla del negocio y no
 * puede vivir adentro de un `.eq()`.
 *
 * La RLS acota a los productos del negocio activo, así que acá no se filtra
 * por `negocio_id`: es defensa en profundidad, no el freno.
 */

export interface DuplicadoEncontrado {
  id: string;
  nombre: string;
  nivel: NivelDuplicado;
  mensaje: string;
}

export async function buscarDuplicadoAction(params: {
  nombre: string;
  categoriaId: string | null;
  marca: string | null;
  productoId?: string;
}): Promise<DuplicadoEncontrado | null> {
  const nombre = params.nombre.trim();
  if (nombre.length < 3) return null;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // `ilike` sin comodines es igualdad sin distinguir mayúsculas. El resto de
  // la normalización —acentos, espacios de más— la hace la lib, que compara
  // con la misma clave para todos los campos.
  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, categoria_id, marca")
    .ilike("nombre", nombre)
    .limit(10);

  if (error) {
    console.error("[DUPLICADO]", error);
    // Degrada a "no hay duplicado": es un aviso, y romper el alta porque el
    // aviso falló sería peor que no avisar.
    return null;
  }

  const encontrado = buscarDuplicado(
    {
      id: params.productoId ?? "",
      nombre,
      categoriaId: params.categoriaId,
      marca: params.marca,
    },
    (data ?? []).map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      categoriaId: (p.categoria_id as string | null) ?? null,
      marca: (p.marca as string | null) ?? null,
    })),
  );

  if (!encontrado) return null;

  // El nombre de la categoría se busca solo para el mensaje del idéntico: es
  // lo que hace que la persona reconozca de cuál producto le están hablando.
  let nombreCategoria: string | null = null;
  if (encontrado.nivel === "IDENTICO" && params.categoriaId) {
    const { data: cat } = await supabase
      .from("categorias")
      .select("nombre")
      .eq("id", params.categoriaId)
      .maybeSingle();
    nombreCategoria = (cat?.nombre as string) ?? null;
  }

  return {
    id: encontrado.producto.id,
    nombre: encontrado.producto.nombre,
    nivel: encontrado.nivel,
    mensaje: mensajeDeDuplicado(encontrado, nombreCategoria),
  };
}
