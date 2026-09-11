import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limpiarCacheTenants, resolverTienda } from "./cache-tenants";
import { ESTADOS_HABILITADOS } from "./estado-negocio";

const envOriginal = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://base.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "clave";
  limpiarCacheTenants();
});

afterEach(() => {
  process.env = { ...envOriginal };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const responder = (filas: unknown[]) =>
  vi.fn(
    async (_url: string) => new Response(JSON.stringify(filas), { status: 200 }),
  );

describe("resolverTienda", () => {
  it("resuelve el negocio y no vuelve a consultar dentro del TTL", async () => {
    const fetchMock = responder([{ id: "neg-1" }]);
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolverTienda("evens")).toEqual({
      estado: "existe",
      negocioId: "neg-1",
    });
    expect(await resolverTienda("evens")).toEqual({
      estado: "existe",
      negocioId: "neg-1",
    });

    // La razón de existir de este módulo: el middleware corre en cada request
    // y no puede pagar una consulta por request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cachea también el slug que no existe", async () => {
    const fetchMock = responder([]);
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolverTienda("noexiste")).toEqual({ estado: "no-existe" });
    expect(await resolverTienda("noexiste")).toEqual({ estado: "no-existe" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("vuelve a consultar cuando venció el TTL", async () => {
    vi.useFakeTimers();
    const fetchMock = responder([{ id: "neg-1" }]);
    vi.stubGlobal("fetch", fetchMock);

    await resolverTienda("evens");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await resolverTienda("evens");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("una ráfaga sobre el mismo slug consulta una sola vez", async () => {
    let resolver: (valor: Response) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise<Response>((res) => (resolver = res)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pedidos = Promise.all([
      resolverTienda("evens"),
      resolverTienda("evens"),
      resolverTienda("evens"),
    ]);
    resolver(new Response(JSON.stringify([{ id: "neg-1" }]), { status: 200 }));

    const resultados = await pedidos;
    expect(resultados.every((r) => r.estado === "existe")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un error NO es 'no existe' y NO se cachea", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await resolverTienda("evens")).toEqual({ estado: "indeterminado" });
    // Cachear el error dejaría la tienda caída hasta que venza el TTL.
    expect(await resolverTienda("evens")).toEqual({ estado: "indeterminado" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Este test afirmaba "pide solo negocios activos" y verificaba
  // `estado=eq.activo`: o sea que el bug de los subdominios en prueba y demo
  // estaba CONGELADO en la suite como si fuera lo correcto. Lo que se prueba
  // acá es la normalización del slug; qué estados se piden se prueba abajo.
  it("es indiferente a mayúsculas en el slug", async () => {
    const fetchMock = responder([{ id: "neg-1" }]);
    vi.stubGlobal("fetch", fetchMock);

    await resolverTienda("EVENS");
    await resolverTienda("evens");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("slug=eq.evens");
  });
});

describe("qué estados considera vivos", () => {
  /**
   * El bug del 11/9/2026: la consulta pedía `estado=eq.activo`, así que el
   * middleware daba "no existe" para todo comercio en prueba o en demo y
   * mandaba su subdominio a /tienda-no-encontrada. Eran 6 de 10 negocios —
   * todos los que están evaluando si pagar, más la tienda de muestra.
   */
  it("pide los tres estados habilitados, no solo activo", async () => {
    const fetchMock = responder([{ id: "neg-1" }]);
    vi.stubGlobal("fetch", fetchMock);

    await resolverTienda("tienda-demo");

    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
    expect(url).toContain("estado=in.(activo,prueba,demo)");
    expect(url).not.toContain("estado=eq.activo");
  });

  // Los dos módulos que traducen slug -> negocio tienen que preguntar lo
  // mismo: es exactamente la divergencia que causó el incidente.
  it("usa la misma lista que el resto del sistema", async () => {
    const fetchMock = responder([{ id: "neg-1" }]);
    vi.stubGlobal("fetch", fetchMock);

    await resolverTienda("evens");

    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
    for (const estado of ESTADOS_HABILITADOS) {
      expect(url).toContain(estado);
    }
  });
});
