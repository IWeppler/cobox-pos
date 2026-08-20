import { afterEach, describe, expect, it, vi } from "vitest";
import { esErrorDeRed, mensajeErrorDeRed } from "./error-de-red";

/** `navigator.onLine` no existe en Node: se simula por test. */
function simularConexion(online: boolean | undefined) {
  if (online === undefined) {
    vi.unstubAllGlobals();
    return;
  }
  vi.stubGlobal("navigator", { onLine: online });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("esErrorDeRed", () => {
  it("reconoce el error real del incidente (Samsung Browser)", () => {
    // El que llegó del celular de Evens: TypeError: Failed to fetch.
    expect(esErrorDeRed(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("reconoce las variantes de los otros motores", () => {
    expect(esErrorDeRed(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(esErrorDeRed(new TypeError("Load failed"))).toBe(true);
    expect(esErrorDeRed(new Error("The Internet connection appears to be offline."))).toBe(true);
    expect(esErrorDeRed(new Error("net::ERR_NETWORK_CHANGED"))).toBe(true);
  });

  it("NO se come un error de la aplicación", () => {
    // Fail-closed: si esto devolviera true, un bug real quedaría escondido
    // detrás de "revisá la conexión" y nadie lo vería nunca.
    expect(esErrorDeRed(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(esErrorDeRed(new Error("VENTA_SIN_RENGLONES"))).toBe(false);
    expect(
      esErrorDeRed(new Error('invalid input syntax for type integer: "7.000"')),
    ).toBe(false);
  });

  it("estar offline alcanza, sin importar el mensaje", () => {
    simularConexion(false);
    expect(esErrorDeRed(new Error("cualquier cosa"))).toBe(true);
  });

  it("estando online, un error cualquiera no es de red", () => {
    simularConexion(true);
    expect(esErrorDeRed(new Error("algo raro"))).toBe(false);
  });

  it("tolera valores que no son Error", () => {
    simularConexion(true);
    expect(esErrorDeRed("Failed to fetch")).toBe(true);
    expect(esErrorDeRed(null)).toBe(false);
    expect(esErrorDeRed(undefined)).toBe(false);
    expect(esErrorDeRed({})).toBe(false);
  });
});

describe("mensajeErrorDeRed", () => {
  it("dice QUÉ no se pudo hacer, no un genérico", () => {
    simularConexion(true);
    expect(mensajeErrorDeRed("guardar el producto")).toContain(
      "guardar el producto",
    );
  });

  it("cambia el texto si el dispositivo está sin conexión", () => {
    simularConexion(false);
    expect(mensajeErrorDeRed("guardar el producto")).toContain("sin conexión");
    simularConexion(true);
    expect(mensajeErrorDeRed("guardar el producto")).toContain(
      "Se cortó la conexión",
    );
  });

  it("nunca afirma que no se guardó nada", () => {
    // `Failed to fetch` no distingue "no llegó" de "llegó y se perdió la
    // respuesta". Afirmarlo sería adivinar sobre mercadería.
    simularConexion(true);
    const msg = mensajeErrorDeRed("guardar el producto").toLowerCase();
    expect(msg).not.toContain("no se guardó");
    expect(msg).not.toContain("no se guardo");
  });
});
