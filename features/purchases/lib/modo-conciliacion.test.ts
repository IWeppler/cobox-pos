import { describe, expect, it } from "vitest";
import {
  decidirModoConciliacion,
  CATALOGO_MINIMO,
  type FilaParaModo,
} from "./modo-conciliacion";

/** Arma filas de remito: `nuevos` grupos sin match y `matcheados` con match,
 * cada grupo con 3 líneas (el promedio real de Evens es 3,35 líneas por
 * grupo, y el modo se decide por grupo, no por línea). */
function remito(nuevos: number, matcheados: number): FilaParaModo[] {
  const filas: FilaParaModo[] = [];
  for (let i = 0; i < nuevos; i++) {
    for (let l = 0; l < 3; l++) {
      filas.push({ raw_nombre: `nuevo-${i}`, estado_match: "DESCONOCIDO" });
    }
  }
  for (let i = 0; i < matcheados; i++) {
    for (let l = 0; l < 3; l++) {
      filas.push({ raw_nombre: `viejo-${i}`, estado_match: "PERFECTO" });
    }
  }
  return filas;
}

describe("decidirModoConciliacion", () => {
  it("cuenta grupos, no líneas", () => {
    const decision = decidirModoConciliacion(remito(2, 8), 500);
    expect(decision.gruposTotales).toBe(10);
    expect(decision.gruposConMatch).toBe(8);
  });

  it("un grupo cuenta como matcheado si CUALQUIERA de sus líneas matcheó", () => {
    const decision = decidirModoConciliacion(
      [
        { raw_nombre: "remera", estado_match: "DESCONOCIDO" },
        { raw_nombre: "remera", estado_match: "PERFECTO" },
      ],
      500,
    );
    expect(decision.gruposConMatch).toBe(1);
  });

  it("con catálogo por debajo del mínimo abre en carga inicial aunque todo matchee", () => {
    const decision = decidirModoConciliacion(remito(0, 3), CATALOGO_MINIMO - 1);
    expect(decision.modo).toBe("CARGA_INICIAL");
    expect(decision.motivo).toBe("CATALOGO_VACIO");
  });

  it("el remito real de Evens (18% de match) abre en carga inicial", () => {
    const decision = decidirModoConciliacion(remito(82, 18), 1226);
    expect(decision.modo).toBe("CARGA_INICIAL");
    expect(decision.motivo).toBe("POCO_MATCH");
  });

  it("un remito de reposición (80% de match) abre en conciliación", () => {
    const decision = decidirModoConciliacion(remito(2, 8), 1226);
    expect(decision.modo).toBe("CONCILIACION");
    expect(decision.motivo).toBe("MAYORIA_MATCHEA");
  });

  it("el umbral es 70% e incluye el borde", () => {
    expect(decidirModoConciliacion(remito(3, 7), 500).modo).toBe(
      "CONCILIACION",
    );
    expect(decidirModoConciliacion(remito(31, 69), 500).modo).toBe(
      "CARGA_INICIAL",
    );
  });

  // Los 4 remitos reales que el cambio de 0,40 a 0,70 mueve de modo: los que
  // matchean en esa banda. Aportaban 25 grupos a la conciliación y los 25
  // terminaron en alta nueva, cero actualizaciones.
  it("un remito que matchea la mitad ahora abre en carga inicial", () => {
    const decision = decidirModoConciliacion(remito(10, 10), 1226);
    expect(decision.modo).toBe("CARGA_INICIAL");
    expect(decision.motivo).toBe("POCO_MATCH");
  });

  it("un remito sin filas no rompe ni divide por cero", () => {
    const decision = decidirModoConciliacion([], 500);
    expect(decision.motivo).toBe("REMITO_VACIO");
    expect(decision.proporcionMatch).toBeNull();
  });
});
