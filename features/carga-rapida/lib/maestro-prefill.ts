import type { Opcion, VarianteInput } from "@/features/stock/types";
import { buildVariantKey } from "@/features/stock/utils/parse-legacy-variant";

/**
 * Lo que Carga Rápida precarga en el alta cuando el EAN escaneado matchea en
 * el Catálogo Maestro. Todo esto se COPIA al producto local al confirmar; el
 * `idMaster` queda solo como referencia (ver migración 20260728170000).
 */
export type PrefillMaestro = {
  idMaster: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  /** El EAN escaneado. Se guarda como `sku` de la variante. */
  ean: string;
  /** Ya con el nombre de atributo LOCAL como clave ("Almacenamiento"), no el
   * slug del maestro — la resolución la hace buscar-en-maestro.ts contra la
   * tabla `atributos` del comercio. */
  atributos: Record<string, string>;
  /** id de la categoría LOCAL equivalente, si el comercio la tiene sembrada. */
  categoriaId: string | null;
  /** Nombre de la categoría del maestro, para mostrar cuando no hay local. */
  categoriaMaestro: string;
};

/**
 * Un candidato de la búsqueda por texto, tal como se ofrece en el picker: lo
 * justo para que el empleado reconozca el producto.
 *
 * NO trae los atributos resueltos ni la categoría local a propósito. Eso
 * cuesta dos queries contra la base del comercio por fila, y de 3 candidatos
 * se descartan 2: se resuelve recién cuando elige uno
 * (obtenerPrefillMaestroAction).
 */
export type CandidatoMaestro = {
  idMaster: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  /** El maestro puede no tenerlo — de hecho 354 de 1267 filas no lo tienen,
   * que es justo por lo que existe la búsqueda por texto. */
  ean: string | null;
  categoriaMaestro: string;
  /** 0..1, para mostrar cuán confiable es el match. */
  score: number;
};

/** Fila cruda de catalogo_maestro, tal como la devuelve el otro proyecto. */
export type FilaCatalogoMaestro = {
  id_master: string;
  categoria: string;
  marca: string;
  modelo_oficial: string;
  nombre_comercial: string;
  ean_gtin: string | null;
  variante_atributos: Record<string, unknown> | null;
};

/**
 * Convierte los atributos del maestro en opciones+variante para el formulario
 * de alta rápida.
 *
 * Una fila del maestro es UNA combinación concreta (128GB / 4GB / Black), no
 * una grilla: por eso cada opción sale con un único valor y se genera una
 * sola variante, que lleva el EAN como sku. Si el empleado después quiere
 * cargar más combinaciones, las agrega a mano en la misma grilla.
 */
export function prefillAVariantes(prefill: PrefillMaestro): {
  opciones: Opcion[];
  variantes: VarianteInput[];
} {
  const entradas = Object.entries(prefill.atributos).filter(
    ([clave, valor]) => clave.trim() && valor.trim(),
  );

  if (entradas.length === 0) {
    return { opciones: [], variantes: [] };
  }

  const valores = Object.fromEntries(entradas);

  return {
    opciones: entradas.map(([nombre, valor]) => ({
      // useVariantSelection identifica cada opción por `id` (foco, borrado,
      // renombre): sin uno propio la grilla se rompe al editar.
      id: crypto.randomUUID(),
      nombre,
      valores: [valor],
    })),
    variantes: [
      {
        // OBLIGATORIO usar buildVariantKey, no una key propia:
        // useVariantSelection indexa variantData y selectedCombinations por
        // esta key y la recalcula con buildVariantKey al armar baseVariants.
        // Si no coinciden, la fila se ve en la grilla pero el stock y el EAN
        // precargados quedan en blanco, sin ningún error visible.
        key: buildVariantKey(valores),
        valores,
        // Precio y costo vacíos: heredan el precio base que el empleado carga
        // arriba. El maestro no tiene precios y no debe inventarlos.
        precio: "",
        precio_costo: "",
        stock: "1",
        sku: prefill.ean,
      },
    ],
  };
}
