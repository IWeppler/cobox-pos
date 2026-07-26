import { SugerenciaSimilitud } from "@/entities/compras/types";
import { sugerirCategoria, SugerenciaCategoria } from "./category-suggestions";

export interface CandidatoSimilar {
  productoId: string;
  nombre: string;
  score: number;
}

export type BucketDesconocido =
  | { tipo: "POSIBLE_MATCH"; candidato: CandidatoSimilar }
  | { tipo: "NUEVO_SUGERIDO"; categoriaSugerida: SugerenciaCategoria }
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
 */
export function clasificarDesconocido(
  rawNombre: string,
  similares: Map<string, CandidatoSimilar>,
): BucketDesconocido {
  const candidato = similares.get(rawNombre);
  if (candidato) return { tipo: "POSIBLE_MATCH", candidato };

  const categoriaSugerida = sugerirCategoria(rawNombre);
  if (categoriaSugerida) return { tipo: "NUEVO_SUGERIDO", categoriaSugerida };

  return { tipo: "AMBIGUO" };
}
