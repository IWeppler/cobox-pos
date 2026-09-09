import { SugerenciaSimilitud } from "@/entities/compras/types";
import { sugerirCategoria, SugerenciaCategoria } from "./category-suggestions";
import {
  resolverCategoriaImport,
  tieneArbolDeAudiencia,
  type CategoriaReal,
} from "./resolve-import-categoria";

export interface CandidatoSimilar {
  productoId: string;
  nombre: string;
  categoriaId: string | null;
  marca: string | null;
  score: number;
}

export type BucketDesconocido =
  | {
      tipo: "POSIBLE_MATCH";
      /** El mejor por score. Se mantiene como campo propio porque es el que
       * la pantalla ofrece primero. */
      candidato: CandidatoSimilar;
      /** TODOS los candidatos que sobrevivieron el filtro, de mejor a peor,
       * incluido el de arriba. Ver `construirMapaSimilares`. */
      candidatos: CandidatoSimilar[];
    }
  | {
      tipo: "NUEVO_SUGERIDO";
      categoriaSugerida: SugerenciaCategoria;
      /** Presente solo cuando la sugerencia salió del árbol REAL (ya es
       * un id válido). Si falta, la UI todavía tiene que resolver el
       * nombre contra las categorías del comercio. */
      categoriaId?: string;
    }
  | { tipo: "AMBIGUO" };

/**
 * La RPC `sugerir_productos_similares` devuelve hasta 3 candidatos por
 * `raw_nombre`, ya ordenados por score. Esto los agrupa por nombre, de mejor
 * a peor, sin asumir el orden de la lista de entrada.
 *
 * ANTES SE QUEDABA CON UNO SOLO, y esa era la mitad escondida del problema
 * que arregló `afinidad-nombre.ts`. Evens tiene 25 productos que empiezan con
 * "VESTIDO EGRESADA": cuando entra el 26, el trigrama pone a los 25 arriba
 * del umbral de 0,60 y la pantalla mostraba UNO, elegido por diferencias de
 * centésimas entre nombres que se distinguen en dos letras. Medido sobre una
 * muestra de 200 nombres de remito de Evens, 78 tienen 2 o más candidatos y
 * 14 tienen 5 o más.
 *
 * Elegir el mejor no está mal; presentarlo como si no hubiera otros, sí. Con
 * la lista completa la pantalla puede decir "¿es este, este o este?", que es
 * la pregunta verdadera.
 */
export function construirMapaSimilares(
  sugerencias: SugerenciaSimilitud[],
): Map<string, CandidatoSimilar[]> {
  const mapa = new Map<string, CandidatoSimilar[]>();
  for (const s of sugerencias) {
    const lista = mapa.get(s.raw_nombre) ?? [];
    // La RPC puede repetir un producto si el mismo nombre entra dos veces en
    // el array de entrada. Dos botones para el mismo producto no son una
    // elección.
    if (lista.some((c) => c.productoId === s.producto_id)) continue;
    lista.push({
      productoId: s.producto_id,
      nombre: s.producto_nombre,
      categoriaId: s.categoria_id,
      marca: s.marca,
      score: s.score,
    });
    mapa.set(s.raw_nombre, lista);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => b.score - a.score);
  }
  return mapa;
}

/**
 * Clasifica un ítem DESCONOCIDO en uno de los 3 estados de la pantalla de
 * conciliación. Prioridad: si hay un producto existente parecido, confirmar
 * esa asociación es mejor que crear un producto nuevo (posible) duplicado
 * — aunque también haya una categoría sugerida por nombre.
 *
 * `rawGenero` + `categoriasReales` son opcionales pero MUY recomendados:
 * sin ellos la sugerencia sale del diccionario plano, que ignora la
 * audiencia y termina proponiendo la subcategoría de otro padre (ej. toda
 * fila "beba" cayendo en "Remeras" de Ropa Niña). Con ellos se resuelve
 * contra el árbol real, mismo criterio que el import.
 */
export function clasificarDesconocido(
  rawNombre: string,
  similares: Map<string, CandidatoSimilar[]>,
  rawGenero?: string | null,
  categoriasReales?: CategoriaReal[],
  /** Columna Categoría del CSV, tal cual vino. */
  rawCategoria?: string | null,
  /** Categoría que el import YA resolvió contra el árbol real. */
  rawCategoriaId?: string | null,
): BucketDesconocido {
  const candidatos = similares.get(rawNombre);
  if (candidatos && candidatos.length > 0) {
    return { tipo: "POSIBLE_MATCH", candidato: candidatos[0], candidatos };
  }

  if (categoriasReales && categoriasReales.length > 0) {
    // La categoría ya resuelta en el import gana sobre cualquier
    // heurística: salió de un match exacto contra el árbol real (o de una
    // elección previa), así que volver a adivinarla acá solo puede
    // empeorarla. Sin esto, una fila con Categoría="JUGUETES" en el CSV
    // llegaba a la conciliación como Ambigua: el diccionario de keywords
    // es de ropa y el corte por árbol de audiencia (abajo) descarta todo
    // lo que no sea Mujer/Hombre/Niña/Niño/Bebé.
    const yaResuelta = rawCategoriaId
      ? categoriasReales.find((c) => c.id === rawCategoriaId)
      : undefined;
    if (yaResuelta) {
      return {
        tipo: "NUEVO_SUGERIDO",
        categoriaSugerida: {
          categoriaNombre: yaResuelta.nombre,
          matchedKeyword: "categoría del archivo",
        },
        categoriaId: yaResuelta.id,
      };
    }

    const resolucion = resolverCategoriaImport(
      rawNombre,
      rawCategoria ?? null,
      rawGenero ?? null,
      categoriasReales,
    );
    if (resolucion) {
      return {
        tipo: "NUEVO_SUGERIDO",
        categoriaSugerida: {
          categoriaNombre: resolucion.categoriaNombre,
          matchedKeyword: rawGenero
            ? `${rawGenero} + nombre`
            : "nombre del producto",
        },
        categoriaId: resolucion.categoriaId,
      };
    }
    // El comercio organiza por audiencia pero no se pudo resolver con
    // confianza: Ambiguo es la respuesta correcta — sugerir la categoría
    // de otra audiencia es peor que no sugerir nada.
    if (tieneArbolDeAudiencia(categoriasReales)) return { tipo: "AMBIGUO" };
  }

  const categoriaSugerida = sugerirCategoria(rawNombre);
  if (categoriaSugerida) return { tipo: "NUEVO_SUGERIDO", categoriaSugerida };

  return { tipo: "AMBIGUO" };
}
