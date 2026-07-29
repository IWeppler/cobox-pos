"use server";

import { cookies } from "next/headers";
import { createClient } from "@/shared/config/supabase/server";
import { createCatalogoMaestroClient } from "@/shared/config/supabase/catalogo-maestro";
import { normalizarRubro } from "@/entities/config/types";
import { slugify } from "@/shared/utils/slugify";
import type {
  CandidatoMaestro,
  FilaCatalogoMaestro,
  PrefillMaestro,
} from "@/features/carga-rapida/lib/maestro-prefill";

const COLUMNAS_MAESTRO =
  "id_master, categoria, marca, modelo_oficial, nombre_comercial, ean_gtin, variante_atributos";

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
/**
 * Gate único para TODO acceso al maestro: valida el rubro contra la base del
 * comercio y recién ahí abre el cliente del maestro.
 *
 * El chequeo vive del lado del servidor y no solo en el cliente porque estas
 * son server actions: son alcanzables directo, y el rubro es la regla de
 * negocio real. Que falten las env vars del maestro es un accidente de
 * configuración, no una garantía — si algún día se setean a nivel team en
 * Vercel, un comercio de indumentaria empezaría a resolver productos contra
 * el catálogo de electro sin que nada lo avise.
 *
 * Fail-closed vía normalizarRubro: si la config no carga, no es electro.
 */
async function abrirMaestroSiCorresponde() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

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

  return { supabase, maestro };
}

/** Traduce una fila del maestro al prefill que consume el alta rápida,
 * resolviendo atributos y categoría contra la base de ESTE comercio. */
async function construirPrefill(
  supabase: ReturnType<typeof createClient>,
  fila: FilaCatalogoMaestro,
  eanElegido: string | null,
): Promise<PrefillMaestro> {
  const [atributos, categoriaId] = await Promise.all([
    resolverNombresDeAtributo(supabase, fila.variante_atributos),
    resolverCategoriaLocal(supabase, fila.categoria),
  ]);

  return {
    idMaster: fila.id_master,
    nombre: fila.nombre_comercial,
    marca: fila.marca || null,
    modelo: fila.modelo_oficial || null,
    ean: eanElegido ?? fila.ean_gtin ?? "",
    atributos,
    categoriaId,
    categoriaMaestro: fila.categoria,
  };
}

export async function buscarEnCatalogoMaestroAction(
  ean: string,
): Promise<PrefillMaestro | null> {
  const codigo = ean.trim();
  if (!codigo) return null;

  const conexion = await abrirMaestroSiCorresponde();
  if (!conexion) return null;
  const { supabase, maestro } = conexion;

  try {
    const { data, error } = await maestro
      .from("catalogo_maestro")
      .select(COLUMNAS_MAESTRO)
      .eq("ean_gtin", codigo)
      .maybeSingle<FilaCatalogoMaestro>();

    if (error || !data) {
      if (error) {
        console.error("[CARGA RAPIDA] Catálogo Maestro no respondió:", error);
      }
      return null;
    }

    return await construirPrefill(supabase, data, codigo);
  } catch (err) {
    console.error("[CARGA RAPIDA] Error consultando el Catálogo Maestro:", err);
    return null;
  }
}

/**
 * Búsqueda por TEXTO en el maestro, para cuando el EAN no alcanza: o el
 * producto no lo tiene cargado (354 de 1267 filas al 29/7/2026), o el
 * empleado tipeó el nombre en vez de escanear.
 *
 * Devuelve CANDIDATOS, no un match. Nunca auto-confirma: el empleado elige,
 * mismo criterio que el resto del proyecto. Lista vacía en todos los caminos
 * de falla — el maestro caído nunca puede impedir cargar stock.
 */
export async function buscarEnCatalogoMaestroPorNombreAction(
  query: string,
): Promise<CandidatoMaestro[]> {
  const texto = query.trim();
  // Con menos de 3 caracteres el trigram devuelve ruido: "ab" matchea
  // cualquier cosa que contenga esas letras seguidas.
  if (texto.length < 3) return [];

  const conexion = await abrirMaestroSiCorresponde();
  if (!conexion) return [];

  try {
    const { data, error } = await conexion.maestro.rpc(
      "buscar_en_catalogo_maestro",
      { p_query: texto, p_umbral: 0.45, p_limite: 3 },
    );

    if (error) {
      console.error("[CARGA RAPIDA] Búsqueda en el maestro falló:", error);
      return [];
    }

    return ((data ?? []) as (FilaCatalogoMaestro & { score: number })[]).map(
      (fila) => ({
        idMaster: fila.id_master,
        nombre: fila.nombre_comercial,
        marca: fila.marca || null,
        modelo: fila.modelo_oficial || null,
        ean: fila.ean_gtin ?? null,
        categoriaMaestro: fila.categoria,
        score: fila.score,
      }),
    );
  } catch (err) {
    console.error("[CARGA RAPIDA] Error buscando en el Catálogo Maestro:", err);
    return [];
  }
}

/**
 * Resuelve el prefill completo de UN candidato ya elegido por el empleado.
 *
 * Va separado de la búsqueda porque resolver atributos y categoría cuesta dos
 * queries contra la base del comercio, y de 3 candidatos se descartan 2.
 */
export async function obtenerPrefillMaestroAction(
  idMaster: string,
): Promise<PrefillMaestro | null> {
  if (!idMaster.trim()) return null;

  const conexion = await abrirMaestroSiCorresponde();
  if (!conexion) return null;
  const { supabase, maestro } = conexion;

  try {
    const { data, error } = await maestro
      .from("catalogo_maestro")
      .select(COLUMNAS_MAESTRO)
      .eq("id_master", idMaster)
      .maybeSingle<FilaCatalogoMaestro>();

    if (error || !data) {
      if (error) {
        console.error("[CARGA RAPIDA] No se pudo leer el candidato:", error);
      }
      return null;
    }

    return await construirPrefill(supabase, data, null);
  } catch (err) {
    console.error("[CARGA RAPIDA] Error resolviendo el candidato:", err);
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
