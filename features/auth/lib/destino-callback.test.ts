import { describe, expect, it } from "vitest";
import { DESTINO_POR_DEFECTO, destinoSeguro } from "./destino-callback";

describe("rutas internas: pasan", () => {
  it("el caso normal del mail de alta", () => {
    expect(destinoSeguro("/onboarding")).toBe("/onboarding");
  });

  it("conserva query y hash", () => {
    expect(destinoSeguro("/configuracion?seccion=listasPrecios")).toBe(
      "/configuracion?seccion=listasPrecios",
    );
  });
});

describe("redirect abierto: no", () => {
  it("una URL absoluta", () => {
    expect(destinoSeguro("https://otro-sitio.com")).toBe(DESTINO_POR_DEFECTO);
  });

  it("protocol-relative, que es el que se escapa", () => {
    // `//evil.com` empieza con "/" y engaña a un `startsWith("/")` solo. El
    // navegador la resuelve como host externo con el protocolo actual.
    expect(destinoSeguro("//evil.com")).toBe(DESTINO_POR_DEFECTO);
    expect(destinoSeguro("//evil.com/robar")).toBe(DESTINO_POR_DEFECTO);
  });

  it("con backslash, que varios navegadores normalizan a barra", () => {
    expect(destinoSeguro("/\\evil.com")).toBe(DESTINO_POR_DEFECTO);
  });

  it("un esquema raro", () => {
    expect(destinoSeguro("javascript:alert(1)")).toBe(DESTINO_POR_DEFECTO);
  });
});

describe("ausente o vacío", () => {
  it("cae al onboarding, que es lo que le falta al que confirmó", () => {
    expect(destinoSeguro(null)).toBe(DESTINO_POR_DEFECTO);
    expect(destinoSeguro(undefined)).toBe(DESTINO_POR_DEFECTO);
    expect(destinoSeguro("")).toBe(DESTINO_POR_DEFECTO);
  });
});
