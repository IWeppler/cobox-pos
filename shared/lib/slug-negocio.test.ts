import { describe, expect, it } from "vitest";
import {
  SLUGS_RESERVADOS,
  slugDesdeNombre,
  validarSlugNegocio,
} from "./slug-negocio";

const ok = (s: string) => validarSlugNegocio(s).valido;

describe("validarSlugNegocio", () => {
  it("acepta los slugs de los negocios vivos", () => {
    for (const slug of [
      "evens-indumentaria",
      "estilo-bonito",
      "ninja-camisetas",
      "clicktostado",
    ]) {
      expect(ok(slug), slug).toBe(true);
    }
  });

  it("respeta el largo mínimo y máximo", () => {
    expect(ok("ab")).toBe(false);
    expect(ok("abc")).toBe(true);
    expect(ok("a".repeat(30))).toBe(true);
    expect(ok("a".repeat(31))).toBe(false);
  });

  it("rechaza mayúsculas, acentos, espacios y puntos", () => {
    // Las mayúsculas y los espacios de los bordes se normalizan, no se rechazan.
    expect(validarSlugNegocio("  Evens  ")).toEqual({
      valido: true,
      slug: "evens",
    });
    expect(ok("almacén")).toBe(false);
    expect(ok("mi tienda")).toBe(false);
    expect(ok("mi.tienda")).toBe(false);
    expect(ok("mi_tienda")).toBe(false);
  });

  it("rechaza el guión en las puntas pero lo permite en el medio", () => {
    expect(ok("-tienda")).toBe(false);
    expect(ok("tienda-")).toBe(false);
    expect(ok("mi-tienda-linda")).toBe(true);
  });

  // El caso que motiva todo: un negocio llamado "App" se llevaba el host del
  // panel privado.
  it("rechaza los subdominios de la plataforma", () => {
    for (const reservado of SLUGS_RESERVADOS) {
      expect(ok(reservado), reservado).toBe(false);
    }
    expect(ok("App")).toBe(false);
    expect(ok("  api  ")).toBe(false);
  });

  it("deja pasar un slug que solo CONTIENE una palabra reservada", () => {
    expect(ok("appliques")).toBe(true);
    expect(ok("mi-app")).toBe(true);
  });
});

describe("slugDesdeNombre", () => {
  it("slugifica nombres reales", () => {
    expect(slugDesdeNombre("Evens Indumentaria")).toBe("evens-indumentaria");
    expect(slugDesdeNombre("Ñandú & Cía.")).toBe("nandu-cia");
  });

  it("recorta al máximo sin dejar guión colgando", () => {
    const s = slugDesdeNombre("a".repeat(29) + " tienda");
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith("-")).toBe(false);
  });

  // No garantiza validez: por eso siempre pasa por validarSlugNegocio.
  it("puede producir un slug inválido", () => {
    expect(slugDesdeNombre("!!!")).toBe("");
    expect(ok(slugDesdeNombre("App"))).toBe(false);
  });
});
