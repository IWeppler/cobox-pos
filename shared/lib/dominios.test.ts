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
    process.env.NEXT_PUBLIC_SITE_URL = "https://cobox-pos.vercel.app";
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("sin wildcard usa el path sobre el dominio del sitio", async () => {
    const { urlDeCatalogo } = await cargarModulo();
    expect(urlDeCatalogo("evens")).toBe(
      "https://cobox-pos.vercel.app/store/evens",
    );
  });

  it("con wildcard usa el subdominio del negocio", async () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "cobox.app";
    const { urlDeCatalogo } = await cargarModulo();
    expect(urlDeCatalogo("evens")).toBe("https://evens.cobox.app");
    expect(urlDeCatalogo("evens", "campera-negra")).toBe(
      "https://evens.cobox.app/store/evens/campera-negra",
    );
  });

  it("no inventa un dominio de producción cuando falta la variable", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { urlDeCatalogo, WILDCARD_HABILITADO } = await cargarModulo();
    expect(WILDCARD_HABILITADO).toBe(false);
    expect(urlDeCatalogo("evens")).toBe("http://localhost:3000/store/evens");
  });
});
