"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { createCatalogoMaestroClient } from "@/shared/config/supabase/catalogo-maestro";
import { normalizarRubro } from "@/entities/config/types";
import { slugify } from "@/shared/utils/slugify";
import type {
  FilaCatalogoMaestro,
  PrefillMaestro,
} from "@/features/carga-rapida/lib/maestro-prefill";

/**
 * Traduce las claves del JSONB del maestro ("almacenamiento") al nombre de
 * atributo tal como existe en ESTE comercio ("Almacenamiento").
 *
 * Es la misma regla de normalización que usa el resto del proyecto
 * (slugify compartido): si no hacemos esto, el alta crearía un atributo
 * "almacenamiento" en minúscula al lado del "Almacenamiento" que ya sembró
 * T4, que es exactamente el drift de casing que normalize-atributo evita.
 * Si el comercio no tiene el atributo, se usa la clave del maestro
 * capitalizada y create-product la canoniza igual al guardar.
 */
async function resolverNombresDeAtributo(
  supabase: ReturnType<typeof createClient>,
  atributosMaestro: Record<string, unknown> | null,
): Promise<Record<string, string>> {
  if (!atributosMaestro) return {};

  const entradas = Object.entries(atributosMaestro).filter(
    ([clave, valor]) =>
      clave.trim() && typeof valor === "string" && valor.trim(),
  ) as [string, string][];

  if (entradas.length === 0) return {};

  const slugs = entradas.map(([clave]) => slugify(clave));
  const { data: locales } = await supabase
    .from("atributos")
    .select("nombre, slug")
    .in("slug", slugs);

  const porSlug = new Map(
    (locales ?? []).map((a: { nombre: string; slug: string }) => [
      a.slug,
      a.nombre,
    ]),
  );

  const resultado: Record<string, string> = {};
  for (const [clave, valor] of entradas) {
    const nombreLocal = porSlug.get(slugify(clave));
    resultado[nombreLocal ?? capitalizar(clave)] = valor.trim();
  }
  return resultado;
}

function capitalizar(texto: string): string {
  const limpio = texto.trim();
  if (!limpio) return limpio;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Busca un EAN en el Catálogo Maestro (otro proyecto Supabase, solo lectura).
 *
 * Devuelve null en TODOS los caminos de falla — rubro que no es electro, sin
 * maestro configurado, sin match, error de red, proyecto caído. Quien llama
 * trata el null como "no está" y cae al alta manual de siempre: que el
 * maestro no responda nunca puede impedir cargar stock.
 */
export async function buscarEnCatalogoMaestroAction(
  ean: string,
): Promise<PrefillMaestro | null> {
  const codigo = ean.trim();
  if (!codigo) return null;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Gate por rubro, ANTES de tocar el maestro. El chequeo va acá y no solo en
  // el cliente porque esto es una server action: es alcanzable directo, y el
  // rubro es la regla de negocio real. Que falten las env vars del maestro es
  // un accidente de configuración, no una garantía — si algún día se setean a
  // nivel team en Vercel, un comercio de indumentaria empezaría a resolver
  // códigos de barra contra el catálogo de electro sin que nada lo avise.
  //
  // Fail-closed vía normalizarRubro: si la config no carga, no es electro.
  const { data: config, error: configError } = await supabase
    .from("configuracion_pos")
    .select("rubro")
    .single();

  if (configError) {
    console.error(
      "[CARGA RAPIDA] No se pudo leer el rubro; no se consulta el maestro:",
      configError,
    );
    return null;
  }

  if (normalizarRubro(config?.rubro) !== "electro") return null;

  const maestro = createCatalogoMaestroClient();
  if (!maestro) return null;

  try {
    const { data, error } = await maestro
      .from("catalogo_maestro")
      .select(
        "id_master, categoria, marca, modelo_oficial, nombre_comercial, ean_gtin, variante_atributos",
      )
      .eq("ean_gtin", codigo)
      .maybeSingle<FilaCatalogoMaestro>();

    if (error || !data) {
      if (error) {
        console.error("[CARGA RAPIDA] Catálogo Maestro no respondió:", error);
      }
      return null;
    }

    const [atributos, categoriaId] = await Promise.all([
      resolverNombresDeAtributo(supabase, data.variante_atributos),
      resolverCategoriaLocal(supabase, data.categoria),
    ]);

    return {
      idMaster: data.id_master,
      nombre: data.nombre_comercial,
      marca: data.marca || null,
      modelo: data.modelo_oficial || null,
      ean: codigo,
      atributos,
      categoriaId,
      categoriaMaestro: data.categoria,
    };
  } catch (err) {
    console.error("[CARGA RAPIDA] Error consultando el Catálogo Maestro:", err);
    return null;
  }
}

/** Mapea la categoría del maestro ("Celulares") a la categoría local por
 * slug — las siembra seed_catalogo_electro() con el mismo slugify. */
async function resolverCategoriaLocal(
  supabase: ReturnType<typeof createClient>,
  categoriaMaestro: string,
): Promise<string | null> {
  if (!categoriaMaestro?.trim()) return null;

  const { data } = await supabase
    .from("categorias")
    .select("id")
    .eq("slug", slugify(categoriaMaestro))
    .is("parent_id", null)
    .maybeSingle();

  return data?.id ?? null;
}
