import { describe, expect, it } from "vitest";
import {
  errorDeCuit,
  esCuitValido,
  formatearCuit,
  formatearCuitParcial,
  normalizarCuit,
} from "./cuit";

// CUITs reales y verificables: el de AFIP/ARCA y uno de persona física
// construido con el algoritmo. Sirven de ancla — si alguien toca los pesos,
// estos dejan de dar.
const CUIT_ARCA = "33693450239";
const CUIT_PERSONA = "20123456786";

describe("normalizarCuit", () => {
  it("acepta como venga: con guiones, puntos o espacios", () => {
    expect(normalizarCuit("30-71234567-8")).toBe("30712345678");
    expect(normalizarCuit("30.71234567.8")).toBe("30712345678");
    expect(normalizarCuit(" 30 71234567 8 ")).toBe("30712345678");
  });

  it("tolera null y undefined", () => {
    expect(normalizarCuit(null)).toBe("");
    expect(normalizarCuit(undefined)).toBe("");
  });
});

describe("esCuitValido", () => {
  it("acepta CUITs con dígito verificador correcto", () => {
    expect(esCuitValido(CUIT_ARCA)).toBe(true);
    expect(esCuitValido(CUIT_PERSONA)).toBe(true);
    expect(esCuitValido("33-69345023-9")).toBe(true);
  });

  it("rechaza el CUIT con un dígito cambiado", () => {
    // Es EL caso que justifica todo esto: un número mal tipeado.
    expect(esCuitValido("33693450238")).toBe(false);
    expect(esCuitValido("20123456785")).toBe(false);
  });

  it("rechaza dos dígitos transpuestos", () => {
    // 20123456786 -> se invierten el 3 y el 4
    expect(esCuitValido("20124356786")).toBe(false);
  });

  it("rechaza longitudes que no son 11", () => {
    expect(esCuitValido("2012345678")).toBe(false);
    expect(esCuitValido("201234567860")).toBe(false);
    expect(esCuitValido("")).toBe(false);
  });

  it("rechaza todos ceros aunque cierre la cuenta del módulo 11", () => {
    // Suma 0, resto 0, verificador 0: pasa la aritmética pero no es un CUIT.
    expect(esCuitValido("00000000000")).toBe(false);
  });

  it("rechaza texto y valores no numéricos", () => {
    expect(esCuitValido("no soy un cuit")).toBe(false);
    expect(esCuitValido(null)).toBe(false);
    expect(esCuitValido(undefined)).toBe(false);
  });
});

describe("formatearCuit", () => {
  it("usa el formato con guiones que se lee en cualquier factura", () => {
    expect(formatearCuit(CUIT_ARCA)).toBe("33-69345023-9");
  });

  it("devuelve el valor tal cual si está incompleto", () => {
    // Formatear a medias mientras se tipea confunde más de lo que ayuda.
    expect(formatearCuit("3369")).toBe("3369");
  });
});

describe("formatearCuitParcial", () => {
  it("va metiendo los guiones a medida que se tipea", () => {
    expect(formatearCuitParcial("3")).toBe("3");
    expect(formatearCuitParcial("33")).toBe("33");
    expect(formatearCuitParcial("336")).toBe("33-6");
    expect(formatearCuitParcial("3369345023")).toBe("33-69345023");
    expect(formatearCuitParcial("33693450239")).toBe("33-69345023-9");
  });

  it("corta en 11 dígitos: el doceavo no entra", () => {
    expect(formatearCuitParcial("336934502391")).toBe("33-69345023-9");
  });

  it("reformatea lo que ya venía con guiones o pegado del portapapeles", () => {
    expect(formatearCuitParcial("33-69345023-9")).toBe("33-69345023-9");
    expect(formatearCuitParcial("CUIT 33.69345023.9")).toBe("33-69345023-9");
  });

  it("vacío se queda vacío: no puede aparecer un guión solo", () => {
    expect(formatearCuitParcial("")).toBe("");
    expect(formatearCuitParcial(null)).toBe("");
  });
});

describe("errorDeCuit", () => {
  it("un campo vacío no es un error todavía", () => {
    // El CUIT es opcional para un cliente no fiscal: vacío es un estado
    // legítimo, no algo para marcar en rojo.
    expect(errorDeCuit("")).toBeNull();
    expect(errorDeCuit(null)).toBeNull();
  });

  it("dice cuántos dígitos faltan, no solo que faltan", () => {
    expect(errorDeCuit("306")).toBe("Faltan 8 dígitos: un CUIT tiene 11.");
    expect(errorDeCuit("3369345023")).toBe("Falta 1 dígito: un CUIT tiene 11.");
  });

  it("avisa cuando sobran dígitos, concordando el singular", () => {
    expect(errorDeCuit("336934502391")).toBe("Sobra 1 dígito: un CUIT tiene 11.");
    expect(errorDeCuit("3369345023912")).toBe(
      "Sobran 2 dígitos: un CUIT tiene 11.",
    );
  });

  it("con los 11 dígitos apunta al número, no al formato", () => {
    // El mensaje viejo ("no es válido") mandaba a probar con y sin guiones,
    // que nunca fue el problema.
    expect(errorDeCuit("33693450238")).toBe(
      "Los 11 dígitos están, pero no cierran entre sí. Revisá que no haya ninguno cambiado.",
    );
  });

  it("los guiones no cambian el diagnóstico, estén donde estén", () => {
    // El formato nunca fue el problema: lo que se mira son los dígitos.
    expect(errorDeCuit("3-3693450-239")).toBeNull();
    expect(errorDeCuit("33693450 239")).toBeNull();
  });

  it("no marca error cuando está bien", () => {
    expect(errorDeCuit(CUIT_ARCA)).toBeNull();
    expect(errorDeCuit("33-69345023-9")).toBeNull();
  });
});
