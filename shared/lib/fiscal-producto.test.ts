import { describe, expect, it } from "vitest";
import {
  alicuotaDe,
  defaultsFiscalesPorRubro,
  desglosarIva,
  normalizarTratamientoIva,
  normalizarUnidadMedida,
} from "./fiscal-producto";
import { RUBROS_VALIDOS } from "@/entities/config/types";

describe("normalizarTratamientoIva", () => {
  it("acepta los cinco tratamientos", () => {
    expect(normalizarTratamientoIva("GRAVADO_105")).toBe("GRAVADO_105");
    expect(normalizarTratamientoIva("EXENTO")).toBe("EXENTO");
    expect(normalizarTratamientoIva("NO_GRAVADO")).toBe("NO_GRAVADO");
  });

  it("cae al 21% ante lo desconocido", () => {
    // Errar al 21% cobra impuesto de más y se corrige. Errar a exento factura
    // sin liquidar el IVA que había que liquidar.
    expect(normalizarTratamientoIva(null)).toBe("GRAVADO_21");
    expect(normalizarTratamientoIva("21")).toBe("GRAVADO_21");
    expect(normalizarTratamientoIva("gravado_21")).toBe("GRAVADO_21");
  });
});

describe("alicuotaDe", () => {
  it("devuelve la alícuota de cada tratamiento", () => {
    expect(alicuotaDe("GRAVADO_21")).toBe(21);
    expect(alicuotaDe("GRAVADO_105")).toBe(10.5);
    expect(alicuotaDe("GRAVADO_27")).toBe(27);
  });

  it("exento y no gravado dan cero", () => {
    expect(alicuotaDe("EXENTO")).toBe(0);
    expect(alicuotaDe("NO_GRAVADO")).toBe(0);
  });
});

describe("desglosarIva", () => {
  it("saca el IVA de adentro del precio, no se lo resta por afuera", () => {
    // EL error clásico: 100 - 21% = 79 está MAL. El neto de 100 con IVA
    // incluido es 82,64 y el impuesto 17,36.
    expect(desglosarIva(100, "GRAVADO_21")).toEqual({ neto: 82.64, iva: 17.36 });
  });

  it("neto + iva da exactamente el precio, sin diferencias de un centavo", () => {
    for (const precio of [100, 1234.56, 999.99, 15750, 0.03]) {
      for (const trat of ["GRAVADO_21", "GRAVADO_105", "GRAVADO_27"]) {
        const { neto, iva } = desglosarIva(precio, trat);
        expect(Number((neto + iva).toFixed(2))).toBe(
          Number(precio.toFixed(2)),
        );
      }
    }
  });

  it("con 10,5% usa la alícuota reducida", () => {
    expect(desglosarIva(110.5, "GRAVADO_105")).toEqual({ neto: 100, iva: 10.5 });
  });

  it("exento y no gravado dejan todo en el neto", () => {
    expect(desglosarIva(100, "EXENTO")).toEqual({ neto: 100, iva: 0 });
    expect(desglosarIva(100, "NO_GRAVADO")).toEqual({ neto: 100, iva: 0 });
  });

  it("un tratamiento inválido se desglosa al 21%, no sin impuesto", () => {
    expect(desglosarIva(121, "cualquier cosa")).toEqual({
      neto: 100,
      iva: 21,
    });
  });
});

describe("normalizarUnidadMedida", () => {
  it("acepta las unidades conocidas y cae a UNIDAD", () => {
    expect(normalizarUnidadMedida("KG")).toBe("KG");
    expect(normalizarUnidadMedida("kg")).toBe("UNIDAD");
    expect(normalizarUnidadMedida(undefined)).toBe("UNIDAD");
  });
});

describe("defaultsFiscalesPorRubro", () => {
  it("los 7 rubros válidos tienen fila propia y nacen en unidad + 21%", () => {
    // Unidad y no KG porque la cadena de cantidad todavía es integer: un
    // producto que nace en KG con stock entero dice una cosa y se comporta como
    // otra. 21% por el mismo fail-closed de normalizarTratamientoIva.
    for (const rubro of RUBROS_VALIDOS) {
      expect(defaultsFiscalesPorRubro(rubro)).toEqual({
        unidad_medida: "UNIDAD",
        tratamiento_iva: "GRAVADO_21",
      });
    }
  });

  it("un valor que no es rubro cae al default general", () => {
    // "carniceria" no es un rubro operativo: la base solo acepta los 7 de
    // RUBROS_VALIDOS en configuracion_pos.rubro.
    expect(defaultsFiscalesPorRubro("carniceria")).toEqual({
      unidad_medida: "UNIDAD",
      tratamiento_iva: "GRAVADO_21",
    });
    expect(defaultsFiscalesPorRubro(null)).toEqual({
      unidad_medida: "UNIDAD",
      tratamiento_iva: "GRAVADO_21",
    });
  });
});
