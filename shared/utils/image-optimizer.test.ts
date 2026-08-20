import { describe, expect, it } from "vitest";
import {
  esFormatoConPerdida,
  presupuestoDe,
  resultadoAceptable,
} from "./image-optimizer";
import {
  MAX_BYTES_GUARDADOS,
  MAX_BYTES_MASTER,
} from "./limites-imagen";

const MB = 1024 * 1024;

describe("esFormatoConPerdida", () => {
  it("webp y jpeg comprimen de verdad", () => {
    expect(esFormatoConPerdida("image/webp")).toBe(true);
    expect(esFormatoConPerdida("image/jpeg")).toBe(true);
  });

  it("png y bmp NO: son sin pérdida y pueden salir más pesados que el original", () => {
    // Es la causa del incidente del 19/8: el WebView devolvió PNG, `quality`
    // no le hizo nada, y llegaron 2,6MB al server como "ya optimizado".
    expect(esFormatoConPerdida("image/png")).toBe(false);
    expect(esFormatoConPerdida("image/bmp")).toBe(false);
    expect(esFormatoConPerdida("image/gif")).toBe(false);
  });
});

describe("presupuestoDe", () => {
  it("el presupuesto siempre es más chico que el límite del servidor", () => {
    // Si fueran iguales no habría margen para reintentar: el primer resultado
    // que el server rechaza sería también el que damos por bueno.
    for (const tipo of ["thumbnail", "grid", "main", "master"] as const) {
      const { presupuesto, limiteServidor } = presupuestoDe(tipo);
      expect(presupuesto).toBeLessThan(limiteServidor);
    }
  });

  it("cada límite de servidor es el que el server realmente aplica", () => {
    expect(presupuestoDe("main").limiteServidor).toBe(MAX_BYTES_GUARDADOS);
    expect(presupuestoDe("grid").limiteServidor).toBe(MAX_BYTES_GUARDADOS);
    expect(presupuestoDe("thumbnail").limiteServidor).toBe(MAX_BYTES_GUARDADOS);
    // El master va aparte a propósito: es la fuente para regenerar, apretarlo
    // como una derivada lo convertiría en otra copia degradada.
    expect(presupuestoDe("master").limiteServidor).toBe(MAX_BYTES_MASTER);
  });

  it("el thumbnail es el más chico y el master el más grande", () => {
    expect(presupuestoDe("thumbnail").presupuesto).toBeLessThan(
      presupuestoDe("grid").presupuesto,
    );
    expect(presupuestoDe("grid").presupuesto).toBeLessThan(
      presupuestoDe("main").presupuesto,
    );
    expect(presupuestoDe("main").presupuesto).toBeLessThan(
      presupuestoDe("master").presupuesto,
    );
  });
});

describe("resultadoAceptable", () => {
  it("acepta un jpeg liviano", () => {
    expect(resultadoAceptable("image/jpeg", 0.3 * MB, "main")).toBe(true);
  });

  it("rechaza el caso exacto del incidente: 2,6MB en PNG", () => {
    expect(resultadoAceptable("image/png", 2.6 * MB, "main")).toBe(false);
  });

  it("rechaza un PNG aunque sea chico: sin pérdida no es optimizado", () => {
    // Importa porque un PNG que hoy entra por tamaño es un WebView que no sabe
    // codificar con pérdida, y la próxima foto va a ser la de 2,6MB.
    expect(resultadoAceptable("image/png", 0.05 * MB, "thumbnail")).toBe(false);
  });

  it("rechaza un jpeg que se pasa del presupuesto de su tipo", () => {
    // 0,5MB está bien para el main y es demasiado para un thumbnail de 150px.
    expect(resultadoAceptable("image/jpeg", 0.5 * MB, "main")).toBe(true);
    expect(resultadoAceptable("image/jpeg", 0.5 * MB, "thumbnail")).toBe(false);
  });

  it("el master tolera lo que una derivada no", () => {
    expect(resultadoAceptable("image/webp", 2 * MB, "master")).toBe(true);
    expect(resultadoAceptable("image/webp", 2 * MB, "main")).toBe(false);
  });
});
