"use server";

import { createClient } from "@/shared/config/supabase/server";
import { cookies } from "next/headers";

export interface SugerenciaValorAtributo {
  valor: string;
  productos: number;
}

/**
 * Sugerencias de valores ya en uso para un atributo (Color, Talle, o
 * cualquier propiedad libre), agregadas en vivo desde
 * producto_variantes.atributos (JSONB) — no desde atributo_valores, que
 * puede estar desactualizado respecto a lo que realmente está cargado
 * (ver migración add_sugerencias_valores_atributo_function).
 */
export async function getAtributoValorSuggestionsAction(
  nombreAtributo: string,
): Promise<SugerenciaValorAtributo[]> {
  const nombre = nombreAtributo?.trim();
  if (!nombre) return [];

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.rpc("sugerencias_valores_atributo", {
    p_nombre: nombre,
  });

  if (error) {
    console.error("[SUGERENCIAS ATRIBUTO] Error:", error);
    return [];
  }

  return (data ?? []).map((row: { valor: string; productos: number }) => ({
    valor: row.valor,
    productos: Number(row.productos),
  }));
}

export interface AtributoRequeridoCategoria {
  atributoId: string;
  nombre: string;
  requerido: boolean;
}

type CategoriaAtributoRow = {
  categoria_id: string;
  atributo_id: string;
  requerido: boolean;
  atributos: { nombre: string } | { nombre: string }[] | null;
};

/**
 * Atributos declarados para una categoría vía categoria_atributos (el form
 * de producto los usa para auto-agregar los requeridos y bloquear el
 * guardado si falta un valor — ver useVariantSelection).
 *
 * HEREDA del padre, un solo nivel. Es lo que el árbol vuelve obligatorio:
 * "Ropa Bebe" declara Género como requerido y tiene 12 subcategorías, así que
 * mirar solo la categoría exacta significaría que colgar el producto de
 * "Ropa Bebe › Bodies" lo exime de una regla que el comercio cargó a
 * propósito. Antes no se notaba porque el selector no dejaba elegir hojas.
 *
 * Lo declarado en la HIJA gana sobre lo del padre: es lo más específico, y es
 * la única forma de que una subcategoría pueda relajar o endurecer la regla
 * de su familia.
 */
export async function getAtributosRequeridosPorCategoriaAction(
  categoriaId: string,
): Promise<AtributoRequeridoCategoria[]> {
  if (!categoriaId) return [];

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: categoria } = await supabase
    .from("categorias")
    .select("parent_id")
    .eq("id", categoriaId)
    .maybeSingle();

  const ids = [categoriaId, categoria?.parent_id].filter(
    (id): id is string => Boolean(id),
  );

  const { data, error } = await supabase
    .from("categoria_atributos")
    .select("categoria_id, atributo_id, requerido, atributos(nombre)")
    .in("categoria_id", ids);

  if (error) {
    console.error("[ATRIBUTOS REQUERIDOS CATEGORIA] Error:", error);
    return [];
  }

  // Se recorre primero la HIJA para que su fila entre al mapa antes que la
  // del padre: el mismo atributo declarado en los dos niveles se resuelve con
  // el más específico y no con el que Postgres haya devuelto primero.
  const filas = (data as CategoriaAtributoRow[] | null) ?? [];
  const porAtributo = new Map<string, AtributoRequeridoCategoria>();

  for (const row of [
    ...filas.filter((f) => f.categoria_id === categoriaId),
    ...filas.filter((f) => f.categoria_id !== categoriaId),
  ]) {
    const atributo = Array.isArray(row.atributos)
      ? row.atributos[0]
      : row.atributos;
    if (!atributo || porAtributo.has(row.atributo_id)) continue;

    porAtributo.set(row.atributo_id, {
      atributoId: row.atributo_id,
      nombre: atributo.nombre,
      requerido: row.requerido,
    });
  }

  return [...porAtributo.values()];
}

/**
 * Nombres de propiedad ya usados en el catálogo (Talle, Color, Género...),
 * leídos de `atributos` — la tabla canónica que normalizarAtributoKeyValor
 * mantiene en cada guardado (creación/edición/conciliación de remitos). No
 * escanea producto_variantes.atributos de nuevo: esa tabla YA es la fuente
 * de verdad deduplicada, con casing consolidado.
 */
export async function getAtributosExistentesAction(): Promise<string[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("atributos")
    .select("nombre")
    .eq("activo", true)
    .order("nombre");

  if (error) {
    console.error("[ATRIBUTOS EXISTENTES] Error:", error);
    return [];
  }

  return (data ?? []).map((row: { nombre: string }) => row.nombre);
}

/**
 * Marcas ya usadas en el catálogo, con cuántos productos tiene cada una.
 *
 * Mismo contrato que las sugerencias de valores de atributo
 * (`SugerenciaValorAtributo`) para que el combobox de marca se vea y se use
 * igual que el de Talle o Color: sugerir lo que ya existe, dejar escribir algo
 * nuevo, y mostrar el peso de cada opción.
 *
 * El conteo NO es decorativo: es lo que hace visible el duplicado. Con
 * "popys — 42 productos" arriba de "Popys — 3 productos", quien carga ve que
 * hay dos formas de la misma marca sin tener que salir a buscarlas.
 *
 * Se agrega en Node y no con un `group by` porque PostgREST no expone
 * agregaciones sin una vista o RPC, y el catálogo más grande son 1.171
 * productos de una columna: no justifica una migración.
 */
export async function getMarcasExistentesAction(): Promise<
  SugerenciaValorAtributo[]
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("productos")
    .select("marca")
    .not("marca", "is", null);

  if (error) {
    console.error("[MARCAS EXISTENTES] Error:", error);
    return [];
  }

  // La clave es case-insensitive para que las dos formas de la misma marca
  // caigan en la misma fila. Se cuenta CADA forma escrita por separado para
  // poder mostrar la más usada: si el catálogo tiene "popys" 42 veces y
  // "Popys" 3, la que se sugiere es la de 42 — sugerir la minoritaria sería
  // empujar al comercio a agrandar el duplicado que esto viene a cerrar.
  const porForma = new Map<string, Map<string, number>>();

  for (const row of (data ?? []) as { marca: string | null }[]) {
    const marca = row.marca?.trim();
    if (!marca) continue;

    const clave = marca.toLowerCase();
    const formas = porForma.get(clave) ?? new Map<string, number>();
    formas.set(marca, (formas.get(marca) ?? 0) + 1);
    porForma.set(clave, formas);
  }

  return [...porForma.values()]
    .map((formas) => {
      const ordenadas = [...formas.entries()].sort((a, b) => b[1] - a[1]);
      return {
        valor: ordenadas[0][0],
        productos: ordenadas.reduce((total, [, n]) => total + n, 0),
      };
    })
    .sort(
      (a, b) =>
        b.productos - a.productos || a.valor.localeCompare(b.valor, "es"),
    );
}
