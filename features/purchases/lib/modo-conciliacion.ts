/**
 * Qué modo de conciliación corresponde para un remito.
 *
 * MODO_CONCILIACION es la pantalla de siempre: vincular cada fila del remito
 * contra el catálogo. Sirve cuando la mayoría de las filas ya existen.
 *
 * MODO_CARGA_INICIAL da vuelta el default: toda fila que no matcheó arranca
 * marcada como "producto nuevo" y se completa en una tabla editable, sin
 * combobox de búsqueda y sin modales.
 *
 * DE DÓNDE SALE EL UMBRAL. Medido sobre los 142 remitos reales de los 4
 * negocios (grupos por `raw_nombre`, match = estado_match distinto de
 * DESCONOCIDO):
 *
 *   - Evens Indumentaria: 17,9% de match global, 118 remitos, 1.226 productos
 *     en catálogo y 5 semanas de uso.
 *   - Estilo Bonito: 27,8%.
 *   - Comercio nuevo: 0%.
 *
 * Y la distribución POR REMITO es bimodal, que es lo que hace que el corte no
 * sea arbitrario: 117 remitos matchean menos del 20%, 21 matchean más del
 * 40%, y solo 3 caen en el medio. El umbral se planta en 40% justamente
 * porque ahí no hay casi nada: mover el número entre 20% y 40% cambia de modo
 * 3 remitos de 142.
 *
 * El otro disparador es el catálogo vacío, y va aparte porque no es un caso
 * borde del porcentaje sino otra pregunta: con 12 productos cargados, "0% de
 * match" no significa que el remito sea raro, significa que no hay contra qué
 * conciliar. Sin ese corte, el primer remito de todo comercio nuevo se
 * dividiría por cero.
 *
 * La dueña puede cambiar de modo a mano SIEMPRE: esto decide con cuál abre,
 * no cuál puede usar.
 */

export type ModoConciliacion = "CONCILIACION" | "CARGA_INICIAL";

/** Debajo de esto no hay catálogo contra el cual conciliar. 20 productos es
 * menos de lo que trae un solo remito chico. */
export const CATALOGO_MINIMO = 20;

/** Proporción de grupos ya reconocidos por debajo de la cual conviene el modo
 * carga inicial. Ver arriba por qué 0,40 y no 0,50. */
export const UMBRAL_MATCH = 0.4;

export type DecisionModo = {
  modo: ModoConciliacion;
  /** Para explicarlo en pantalla. La persona tiene que poder entender por qué
   * la pantalla abrió como abrió antes de decidir cambiarla. */
  motivo: "CATALOGO_VACIO" | "POCO_MATCH" | "MAYORIA_MATCHEA" | "REMITO_VACIO";
  gruposTotales: number;
  gruposConMatch: number;
  /** 0..1. `null` cuando no hay grupos (no es 0: no se midió nada). */
  proporcionMatch: number | null;
};

export type FilaParaModo = {
  raw_nombre: string;
  estado_match: string;
};

/**
 * Función pura. Recibe las filas del remito tal como vienen de la base y
 * cuántos productos publicados tiene el comercio.
 *
 * Cuenta GRUPOS (raw_nombre distinto), no líneas, porque el grupo es la
 * unidad de trabajo: un producto con 8 talles son 8 líneas y una sola
 * decisión.
 */
export function decidirModoConciliacion(
  filas: FilaParaModo[],
  productosEnCatalogo: number,
): DecisionModo {
  const gruposConEstado = new Map<string, boolean>();
  for (const fila of filas) {
    const yaMatcheado = gruposConEstado.get(fila.raw_nombre) ?? false;
    gruposConEstado.set(
      fila.raw_nombre,
      yaMatcheado || fila.estado_match !== "DESCONOCIDO",
    );
  }

  const gruposTotales = gruposConEstado.size;
  const gruposConMatch = Array.from(gruposConEstado.values()).filter(
    Boolean,
  ).length;

  if (gruposTotales === 0) {
    return {
      modo: "CONCILIACION",
      motivo: "REMITO_VACIO",
      gruposTotales: 0,
      gruposConMatch: 0,
      proporcionMatch: null,
    };
  }

  const proporcionMatch = gruposConMatch / gruposTotales;

  // El catálogo vacío manda incluso si por casualidad matchearon todas: con
  // 5 productos cargados, 3 de 3 matcheados no dice nada sobre el remito que
  // viene.
  if (productosEnCatalogo < CATALOGO_MINIMO) {
    return {
      modo: "CARGA_INICIAL",
      motivo: "CATALOGO_VACIO",
      gruposTotales,
      gruposConMatch,
      proporcionMatch,
    };
  }

  return {
    modo: proporcionMatch < UMBRAL_MATCH ? "CARGA_INICIAL" : "CONCILIACION",
    motivo: proporcionMatch < UMBRAL_MATCH ? "POCO_MATCH" : "MAYORIA_MATCHEA",
    gruposTotales,
    gruposConMatch,
    proporcionMatch,
  };
}

/** El texto que explica la decisión, en la pantalla. Voseo. */
export function explicarModo(decision: DecisionModo): string {
  const pct =
    decision.proporcionMatch === null
      ? "0"
      : Math.round(decision.proporcionMatch * 100).toString();

  switch (decision.motivo) {
    case "CATALOGO_VACIO":
      return "Tu catálogo todavía está casi vacío, así que abrimos en carga inicial: todas las filas arrancan como productos nuevos.";
    case "POCO_MATCH":
      return `Solo ${decision.gruposConMatch} de ${decision.gruposTotales} productos de este remito ya están en tu catálogo (${pct}%). Abrimos en carga inicial para que los cargues de una.`;
    case "MAYORIA_MATCHEA":
      return `${decision.gruposConMatch} de ${decision.gruposTotales} productos de este remito ya están en tu catálogo (${pct}%). Abrimos en conciliación.`;
    case "REMITO_VACIO":
      return "Este remito no tiene filas para conciliar.";
  }
}
