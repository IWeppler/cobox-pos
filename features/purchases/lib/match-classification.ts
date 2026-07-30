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
  | { tipo: "POSIBLE_MATCH"; candidato: CandidatoSimilar }
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
 * `raw_nombre`, ya ordenados por score. Esto arma un mapa 1:1 raw_nombre ->
 * mejor candidato, sin asumir el orden de la lista de entrada.
 */
export function construirMapaSimilares(
  sugerencias: SugerenciaSimilitud[],
): Map<string, CandidatoSimilar> {
  const mapa = new Map<string, CandidatoSimilar>();
  for (const s of sugerencias) {
    const actual = mapa.get(s.raw_nombre);
    if (!actual || s.score > actual.score) {
      mapa.set(s.raw_nombre, {
        productoId: s.producto_id,
        nombre: s.producto_nombre,
        categoriaId: s.categoria_id,
        marca: s.marca,
        score: s.score,
      });
    }
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
  similares: Map<string, CandidatoSimilar>,
  rawGenero?: string | null,
  categoriasReales?: CategoriaReal[],
  /** Columna Categoría del CSV, tal cual vino. */
  rawCategoria?: string | null,
  /** Categoría que el import YA resolvió contra el árbol real. */
  rawCategoriaId?: string | null,
): BucketDesconocido {
  const candidato = similares.get(rawNombre);
  if (candidato) return { tipo: "POSIBLE_MATCH", candidato };

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
