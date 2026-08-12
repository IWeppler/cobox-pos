import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limpiarCacheTenants, resolverTienda } from "./cache-tenants";

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

  it("es indiferente a mayúsculas y pide solo negocios activos", async () => {
    const fetchMock = responder([{ id: "neg-1" }]);
    vi.stubGlobal("fetch", fetchMock);

    await resolverTienda("EVENS");
    await resolverTienda("evens");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("slug=eq.evens");
    expect(url).toContain("estado=eq.activo");
  });
});
