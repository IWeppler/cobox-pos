import type { Rubro } from "@/entities/config/types";
import { slugify } from "@/shared/utils/slugify";
import { normalizar } from "./category-suggestions";
import {
  resolverCategoriaImport,
  type CategoriaReal,
} from "./resolve-import-categoria";
import { categoriaPorTerminos } from "./terminos-por-rubro";

/**
 * La categoría con la que arranca una fila en el modo carga inicial.
 *
 * La diferencia con `clasificarDesconocido` no es el algoritmo sino la
 * PROMESA: acá la categoría se muestra YA PUESTA en un select editable, no
 * como una sugerencia que hay que aceptar con un botón. Por eso esta función
 * siempre devuelve algo utilizable, y cuando no puede resolver contra el
 * catálogo del comercio propone crear una categoría con nombre genérico en
 * vez de devolver null.
 *
 * Cuatro escalones, del más confiable al menos:
 *
 *   1. ARCHIVO   — la columna Categoría del remito ya resolvió contra el
 *                  árbol real durante el import (`raw_categoria_id`).
 *   2. ARBOL     — `resolverCategoriaImport`: nombre exacto, o audiencia +
 *                  tipo de prenda contra el árbol real del comercio.
 *   3. LOCAL     — el diccionario de términos del rubro da un nombre
 *                  genérico ("Camperas") y el comercio tiene una categoría
 *                  cuyo slug lo contiene.
 *   4. NUEVA     — el diccionario dio un nombre y el comercio no tiene nada
 *                  parecido. Se propone crearla; la fila muestra el nombre
 *                  con la marca de "nueva".
 *
 * Si ni el diccionario matchea, queda NINGUNA y la fila muestra el select
 * vacío. No se inventa una categoría a partir del nombre del producto: eso
 * es lo que producía catálogos con una categoría por producto.
 */
export type OrigenCategoria =
  "ARCHIVO" | "ARBOL" | "LOCAL" | "NUEVA" | "NINGUNA";

export type CategoriaInferida = {
  /** null cuando hay que crearla (origen NUEVA) o no se sabe (NINGUNA). */
  categoriaId: string | null;
  /** Lo que se muestra en la fila. Vacío solo en NINGUNA. */
  nombre: string;
  origen: OrigenCategoria;
};

type Params = {
  rawNombre: string;
  rawCategoria: string | null;
  rawCategoriaId: string | null;
  rawGenero: string | null;
  categorias: CategoriaReal[];
  rubro: Rubro;
};

/**
 * Busca en el árbol del comercio una categoría que corresponda al nombre
 * genérico del diccionario. Compara por SLUG y no por nombre porque los
 * nombres reales vienen sucios ("CAMPERAS Y CHALECOS DE  HOMBRE", con doble
 * espacio): el slug de la propuesta ("camperas") aparece adentro del slug
 * real ("camperas-y-chalecos-de-hombre").
 *
 * Prefiere una HIJA sobre una raíz: en un árbol por audiencia, colgar de
 * "Ropa Mujer › Camperas" es más específico que de una raíz "Camperas".
 * Entre varias hijas candidatas no elige ninguna — con audiencia ambigua,
 * `resolverCategoriaImport` (escalón 2) ya tuvo su chance y no resolvió;
 * adivinar acá es colgar mercadería de mujer abajo de hombre.
 */
function buscarCategoriaLocal(
  nombreGenerico: string,
  categorias: CategoriaReal[],
): CategoriaReal | null {
  const slugBuscado = slugify(nombreGenerico);
  if (!slugBuscado) return null;

  const candidatas = categorias.filter(
    (c) => c.slug === slugBuscado || c.slug.includes(slugBuscado),
  );
  if (candidatas.length === 0) return null;

  const exacta = candidatas.find((c) => c.slug === slugBuscado);
  if (exacta) return exacta;

  const hijas = candidatas.filter((c) => c.parent_id !== null);
  if (hijas.length === 1) return hijas[0];

  const raices = candidatas.filter((c) => c.parent_id === null);
  if (raices.length === 1) return raices[0];

  return null;
}

export function inferirCategoriaFila({
  rawNombre,
  rawCategoria,
  rawCategoriaId,
  rawGenero,
  categorias,
  rubro,
}: Params): CategoriaInferida {
  if (rawCategoriaId) {
    const delArchivo = categorias.find((c) => c.id === rawCategoriaId);
    if (delArchivo) {
      return {
        categoriaId: delArchivo.id,
        nombre: delArchivo.nombre,
        origen: "ARCHIVO",
      };
    }
  }

  const porArbol = resolverCategoriaImport(
    rawNombre,
    rawCategoria,
    rawGenero,
    categorias,
  );
  if (porArbol) {
    return {
      categoriaId: porArbol.categoriaId,
      nombre: porArbol.categoriaNombre,
      origen: "ARBOL",
    };
  }

  // El diccionario mira el nombre del producto y, si vino, la columna
  // Categoría del archivo: "CAMPERA RUSTICA ESTRELLITA" da Camperas, pero
  // también lo da una fila llamada "estrellita" con Categoría "camperas".
  const texto = normalizar(`${rawNombre} ${rawCategoria ?? ""}`);
  const generico = categoriaPorTerminos(texto, rubro);
  if (!generico) {
    return { categoriaId: null, nombre: "", origen: "NINGUNA" };
  }

  const local = buscarCategoriaLocal(generico, categorias);
  if (local) {
    return { categoriaId: local.id, nombre: local.nombre, origen: "LOCAL" };
  }

  return { categoriaId: null, nombre: generico, origen: "NUEVA" };
}
