import { describe, expect, it } from "vitest";
import {
  MOTIVOS_ANULACION,
  esMotivoAnulacion,
  etiquetaMotivoAnulacion,
  normalizarMotivoAnulacion,
} from "./motivo-anulacion";

describe("motivos de anulación", () => {
  it("son exactamente los cinco del CHECK de la base", () => {
    // El CHECK `ventas_motivo_codigo_check` (20260903140000) tiene esta misma
    // lista. Si acá se agrega uno y allá no, la anulación falla al guardar.
    expect(MOTIVOS_ANULACION.map((motivo) => motivo.codigo)).toEqual([
      "ERROR_DE_CARGA",
      "CAMBIO",
      "ARREPENTIMIENTO",
      "FALLADO",
      "OTRO",
    ]);
  });

  it("no confunde el motivo con el destino de la mercadería", () => {
    // RESTAURAR_STOCK y BAJA son la otra pregunta. Que sean válidos acá sería
    // volver al agujero que esta separación vino a cerrar.
    expect(esMotivoAnulacion("RESTAURAR_STOCK")).toBe(false);
    expect(esMotivoAnulacion("BAJA")).toBe(false);
  });

  it("normalizar es fail-closed: lo desconocido va a null, no a un default", () => {
    expect(normalizarMotivoAnulacion("CAMBIO")).toBe("CAMBIO");
    expect(normalizarMotivoAnulacion("cambio")).toBeNull();
    expect(normalizarMotivoAnulacion("")).toBeNull();
    expect(normalizarMotivoAnulacion(undefined)).toBeNull();
    expect(normalizarMotivoAnulacion(null)).toBeNull();
    expect(normalizarMotivoAnulacion("INVENTADO")).toBeNull();
  });

  it("etiqueta lo conocido y deja ver lo que no", () => {
    expect(etiquetaMotivoAnulacion("ERROR_DE_CARGA")).toBe(
      "La venta se cargó mal",
    );
    expect(etiquetaMotivoAnulacion(null)).toBe("Sin motivo registrado");
    // Un código viejo o de otra versión se muestra tal cual: traducido a "—"
    // no se entera nadie de que quedó algo raro guardado.
    expect(etiquetaMotivoAnulacion("VIEJO")).toBe("VIEJO");
  });

  it("cada motivo tiene etiqueta y ayuda escritas", () => {
    for (const motivo of MOTIVOS_ANULACION) {
      expect(motivo.label.length).toBeGreaterThan(0);
      expect(motivo.ayuda.length).toBeGreaterThan(0);
    }
  });
});
