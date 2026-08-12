import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DestinoHost } from "./host-comerz";

const cargar = async () => {
  vi.resetModules();
  return import("./ruteo-host");
};

const envOriginal = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = "comerz.app";
  process.env.NEXT_PUBLIC_SITE_URL = "https://comerz-pos.vercel.app";
});

afterEach(() => {
  process.env = { ...envOriginal };
});

const tienda = (slug = "evens"): DestinoHost => ({ tipo: "tienda", slug });

describe("host del panel", () => {
  it("sigue el pipeline de siempre, sin tocar nada", async () => {
    const { decidirRuteo } = await cargar();
    expect(decidirRuteo({ destino: { tipo: "app" }, pathname: "/pos" })).toEqual(
      { tipo: "seguir" },
    );
  });
});

describe("landing", () => {
  it("manda al panel mientras la landing no exista", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({ destino: { tipo: "landing" }, pathname: "/" }),
    ).toEqual({ tipo: "redirect", destino: "https://app.comerz.app/" });
  });

  it("conserva el path y la query al redirigir", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({
        destino: { tipo: "landing" },
        pathname: "/auth",
        search: "?error=sin-negocio",
      }),
    ).toEqual({
      tipo: "redirect",
      destino: "https://app.comerz.app/auth?error=sin-negocio",
    });
  });
});

describe("subdominio de tienda", () => {
  it("la raíz es la portada del catálogo, sin cambiar la URL", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({ destino: tienda(), pathname: "/", tiendaExiste: true }),
    ).toEqual({ tipo: "rewrite", pathname: "/store/evens" });
  });

  it("un segmento suelto es un producto", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({
        destino: tienda(),
        pathname: "/campera-negra",
        tiendaExiste: true,
      }),
    ).toEqual({ tipo: "rewrite", pathname: "/store/evens/campera-negra" });
  });

  it("un slug que no existe da 404 propio, no una excepción", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({
        destino: tienda("noexiste"),
        pathname: "/",
        tiendaExiste: false,
      }),
    ).toEqual({ tipo: "no-encontrada" });
  });

  it("si no se pudo resolver el slug, deja pasar en vez de 404ear", async () => {
    const { decidirRuteo } = await cargar();
    // Supabase caído no puede apagar todos los catálogos: la página resuelve
    // el tenant por su cuenta y hace su propio 404 si de verdad no existe.
    expect(
      decidirRuteo({ destino: tienda(), pathname: "/", tiendaExiste: null }),
    ).toEqual({ tipo: "rewrite", pathname: "/store/evens" });
  });

  it("la ruta interna no se muestra: se devuelve a la URL limpia", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({
        destino: tienda(),
        pathname: "/store/evens/campera-negra",
        tiendaExiste: true,
      }),
    ).toEqual({ tipo: "redirect", destino: "/campera-negra" });
    expect(
      decidirRuteo({
        destino: tienda(),
        pathname: "/store/evens",
        tiendaExiste: true,
      }),
    ).toEqual({ tipo: "redirect", destino: "/" });
  });

  it("el catálogo de otro negocio se manda a SU subdominio", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({
        destino: tienda(),
        pathname: "/store/estilobonito/remera",
        tiendaExiste: true,
      }),
    ).toEqual({
      tipo: "redirect",
      destino: "https://estilobonito.comerz.app/remera",
    });
  });

  it("las rutas del panel se van al host del panel", async () => {
    const { decidirRuteo } = await cargar();
    for (const ruta of ["/auth", "/pos", "/caja/turnos", "/configuracion"]) {
      expect(
        decidirRuteo({ destino: tienda(), pathname: ruta, tiendaExiste: true }),
      ).toEqual({ tipo: "redirect", destino: `https://app.comerz.app${ruta}` });
    }
  });

  it("un producto que se llama parecido a una ruta del panel sigue siendo producto", async () => {
    const { decidirRuteo } = await cargar();
    expect(
      decidirRuteo({
        destino: tienda(),
        pathname: "/posavasos",
        tiendaExiste: true,
      }),
    ).toEqual({ tipo: "rewrite", pathname: "/store/evens/posavasos" });
  });

  it("la query del catálogo sobrevive al rewrite", async () => {
    const { decidirRuteo } = await cargar();
    // El rewrite solo cambia el pathname; el middleware clona la URL, así que
    // la query viaja sola. Acá se fija que no se la pise.
    expect(
      decidirRuteo({
        destino: tienda(),
        pathname: "/",
        search: "?categoria=camperas",
        tiendaExiste: true,
      }),
    ).toEqual({ tipo: "rewrite", pathname: "/store/evens" });
  });
});

describe("sin wildcard", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });

  it("el panel es el dominio del sitio", async () => {
    const { urlDelPanel } = await cargar();
    expect(urlDelPanel("/auth")).toBe("https://comerz-pos.vercel.app/auth");
  });

  it("la tienda de otro negocio se resuelve por path", async () => {
    const { urlDeTienda } = await cargar();
    expect(urlDeTienda("estilobonito", "/remera")).toBe(
      "https://comerz-pos.vercel.app/store/estilobonito/remera",
    );
  });
});
