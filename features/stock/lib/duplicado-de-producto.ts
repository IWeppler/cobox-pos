import { normalizarBusqueda } from "@/shared/lib/normalizar-busqueda";

/**
 * Cuándo dos productos son EL MISMO y no dos parecidos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL NOMBRE SOLO NO ALCANZA, Y EL NÚMERO LO PRUEBA
 *
 * Contados por nombre, el SaaS tenía 42 "duplicados". Contados por nombre +
 * categoría + marca, son 11. Los 31 restantes no son errores: la misma REMERA
 * BASICA en HOMBRE y en MUJER son dos productos de verdad, y la misma prenda
 * de dos marcas también. Un aviso que salte en esos 31 casos es un aviso que
 * se aprende a ignorar, y entonces tampoco frena los 11 que importan.
 *
 * Lo dijo la dueña cuando le mostré los 42, y tenía razón: "no necesariamente
 * son errores, porque tal vez cambia la marca también, no solo la categoría".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ AVISA Y NO IMPIDE
 *
 * No hay índice único sobre el nombre y no debería haberlo: con 11 casos vivos
 * lo primero que haría es romper altas legítimas, y dos productos pueden
 * llamarse igual a propósito. El nombre avisa; no manda.
 *
 * Nace del caso del 10/9/2026: un remito creó "REMERONES VANIC OVERSIZE"
 * cuando ese producto ya existía con el nombre idéntico, la misma categoría y
 * la misma marca (ninguna). Nadie escribió mal nada: el sistema simplemente no
 * miró.
 */

export interface ProductoComparable {
  id: string;
  nombre: string;
  categoriaId?: string | null;
  marca?: string | null;
}

/** Igual que la identidad de la base: sin acentos, sin mayúsculas, sin espacios de más. */
function clave(valor: string | null | undefined): string {
  return normalizarBusqueda(valor ?? "").replace(/\s+/g, " ").trim();
}

export type NivelDuplicado = "IDENTICO" | "MISMO_NOMBRE" | "NINGUNO";

export interface Duplicado {
  producto: ProductoComparable;
  nivel: NivelDuplicado;
}

/**
 * El producto existente que choca con el que se está por crear.
 *
 * Devuelve el NIVEL y no un booleano porque las dos respuestas llevan a
 * mensajes distintos:
 *
 *   IDENTICO      nombre + categoría + marca: casi seguro es el mismo. Se
 *                 ofrece usar el que ya existe.
 *   MISMO_NOMBRE  coincide el nombre pero no la categoría o la marca. Se
 *                 menciona al pasar, sin recomendar nada: es el caso de las
 *                 31 coincidencias legítimas.
 *
 * Si hay varios, gana el más parecido: un idéntico le gana a cualquier
 * homónimo.
 */
export function buscarDuplicado(
  candidato: ProductoComparable,
  existentes: ProductoComparable[],
): Duplicado | null {
  const nombre = clave(candidato.nombre);
  if (!nombre) return null;

  let homonimo: ProductoComparable | null = null;

  for (const p of existentes) {
    if (p.id === candidato.id) continue;
    if (clave(p.nombre) !== nombre) continue;

    const mismaCategoria =
      (p.categoriaId ?? null) === (candidato.categoriaId ?? null);
    const mismaMarca = clave(p.marca) === clave(candidato.marca);

    if (mismaCategoria && mismaMarca) {
      return { producto: p, nivel: "IDENTICO" };
    }
    // El primero que aparece: sin nada que los ordene, el orden de la lista es
    // tan bueno como cualquier otro y elegir "el mejor homónimo" sería
    // inventar un criterio.
    homonimo ??= p;
  }

  return homonimo ? { producto: homonimo, nivel: "MISMO_NOMBRE" } : null;
}

/** Lo que se le dice a la persona. En la lib y no en el JSX para poder testearlo. */
export function mensajeDeDuplicado(
  duplicado: Duplicado,
  nombreCategoria?: string | null,
): string {
  if (duplicado.nivel === "IDENTICO") {
    return nombreCategoria
      ? `Ya tenés "${duplicado.producto.nombre}" en ${nombreCategoria}. Si es el mismo, cargale el stock a ese en vez de crear otro.`
      : `Ya tenés un producto con este nombre, la misma categoría y la misma marca. Si es el mismo, cargale el stock a ese en vez de crear otro.`;
  }

  return `Hay otro producto llamado "${duplicado.producto.nombre}", pero en otra categoría o de otra marca. Suele ser correcto: revisalo si tenés dudas.`;
}
