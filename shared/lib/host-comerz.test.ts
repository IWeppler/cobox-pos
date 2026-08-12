import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cargar = async () => {
  vi.resetModules();
  return import("./host-comerz");
};

const envOriginal = { ...process.env };

afterEach(() => {
  process.env = { ...envOriginal };
});

describe("clasificarHost con wildcard", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "comerz.app";
  });

  it("app.comerz.app es el panel", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("app.comerz.app")).toEqual({ tipo: "app" });
  });

  it("el dominio desnudo y www son la landing", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("comerz.app")).toEqual({ tipo: "landing" });
    expect(clasificarHost("www.comerz.app")).toEqual({ tipo: "landing" });
  });

  it("un subdominio libre es la tienda de ese slug", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("evens.comerz.app")).toEqual({
      tipo: "tienda",
      slug: "evens",
    });
  });

  it("ignora el puerto y las mayúsculas", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("Evens.Comerz.App:3000")).toEqual({
      tipo: "tienda",
      slug: "evens",
    });
  });

  it("un subdominio reservado nunca es una tienda", async () => {
    const { clasificarHost } = await cargar();
    for (const reservado of ["api", "admin", "auth", "cdn", "status"]) {
      expect(clasificarHost(`${reservado}.comerz.app`)).toEqual({ tipo: "app" });
    }
  });

  it("una etiqueta que no podría ser slug no es una tienda", async () => {
    const { clasificarHost } = await cargar();
    // Demasiado corta y con guión al final: el alta las rechaza, el ruteo
    // también, o se serviría un catálogo con un slug que nadie pudo registrar.
    expect(clasificarHost("ab.comerz.app")).toEqual({ tipo: "app" });
    expect(clasificarHost("evens-.comerz.app")).toEqual({ tipo: "app" });
  });

  it("un sub-subdominio no es una tienda", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("a.b.comerz.app")).toEqual({ tipo: "app" });
  });

  it("un dominio ajeno no se clasifica como tienda", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("evens.otrodominio.com")).toEqual({ tipo: "app" });
  });
});

describe("clasificarHost sin wildcard", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });

  it("nunca clasifica como landing", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("comerz.app")).toEqual({ tipo: "app" });
  });

  it("conserva el modo anterior: un subdominio suelto sigue siendo tienda", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("evens.comerz.app")).toEqual({
      tipo: "tienda",
      slug: "evens",
    });
  });

  it("localhost y los previews de Vercel son el panel", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("localhost:3000")).toEqual({ tipo: "app" });
    expect(clasificarHost("comerz-pos-git-main-x.vercel.app")).toEqual({
      tipo: "app",
    });
  });
});

describe("override de desarrollo", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "comerz.app";
  });

  it("fuerza la tienda en localhost y en previews", async () => {
    const { clasificarHost } = await cargar();
    expect(
      clasificarHost("localhost:3000", { overrideTienda: "evens" }),
    ).toEqual({ tipo: "tienda", slug: "evens" });
    expect(
      clasificarHost("comerz-pos-git-main-x.vercel.app", {
        overrideTienda: "evens",
      }),
    ).toEqual({ tipo: "tienda", slug: "evens" });
    expect(
      clasificarHost("192.168.0.14:3000", { overrideTienda: "evens" }),
    ).toEqual({ tipo: "tienda", slug: "evens" });
  });

  it("NO se honra en producción: un header no elige el tenant", async () => {
    const { clasificarHost } = await cargar();
    expect(
      clasificarHost("app.comerz.app", { overrideTienda: "evens" }),
    ).toEqual({ tipo: "app" });
    expect(
      clasificarHost("estilobonito.comerz.app", { overrideTienda: "evens" }),
    ).toEqual({ tipo: "tienda", slug: "estilobonito" });
  });

  it("un override inválido se ignora en vez de romper", async () => {
    const { clasificarHost } = await cargar();
    expect(clasificarHost("localhost", { overrideTienda: "api" })).toEqual({
      tipo: "app",
    });
    expect(clasificarHost("localhost", { overrideTienda: "  " })).toEqual({
      tipo: "app",
    });
  });
});
