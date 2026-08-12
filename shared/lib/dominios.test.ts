import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cargarModulo = async () => {
  vi.resetModules();
  return import("./dominios");
};

describe("rutaCatalogo", () => {
  it("arma la ruta del catálogo y del producto", async () => {
    const { rutaCatalogo } = await cargarModulo();
    expect(rutaCatalogo("evens")).toBe("/store/evens");
    expect(rutaCatalogo("evens", "campera-negra")).toBe(
      "/store/evens/campera-negra",
    );
  });
});

describe("urlDeCatalogo", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    process.env.NEXT_PUBLIC_SITE_URL = "https://comerz-pos.vercel.app";
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("sin wildcard usa el path sobre el dominio del sitio", async () => {
    const { urlDeCatalogo } = await cargarModulo();
    expect(urlDeCatalogo("evens")).toBe(
      "https://comerz-pos.vercel.app/store/evens",
    );
  });

  it("con wildcard usa el subdominio del negocio", async () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "comerz.app";
    const { urlDeCatalogo } = await cargarModulo();
    expect(urlDeCatalogo("evens")).toBe("https://evens.comerz.app");
    // En el subdominio el producto cuelga de la raíz: la ruta interna
    // (/store/evens/...) no puede aparecer en un link que se comparte.
    expect(urlDeCatalogo("evens", "campera-negra")).toBe(
      "https://evens.comerz.app/campera-negra",
    );
  });

  it("no inventa un dominio de producción cuando falta la variable", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { urlDeCatalogo, WILDCARD_HABILITADO } = await cargarModulo();
    expect(WILDCARD_HABILITADO).toBe(false);
    expect(urlDeCatalogo("evens")).toBe("http://localhost:3000/store/evens");
  });
});
