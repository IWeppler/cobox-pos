import { beforeEach, describe, expect, it, vi } from "vitest";

const registrarVentaAction = vi.fn();
const quitarVentaPendiente = vi.fn();
const marcarIntentoFallido = vi.fn();
const ventasPendientes = vi.fn();

vi.mock("@/features/sales/actions/create-sale", () => ({
  registrarVentaAction: (...args: unknown[]) => registrarVentaAction(...args),
}));

vi.mock("./outbox-ventas", () => ({
  ventasPendientes: (...args: unknown[]) => ventasPendientes(...args),
  quitarVentaPendiente: (...args: unknown[]) => quitarVentaPendiente(...args),
  marcarIntentoFallido: (...args: unknown[]) => marcarIntentoFallido(...args),
}));

const { sincronizarVentas } = await import("./sincronizar-ventas");

const venta = (ventaId: string, vendidaEn: string) => ({
  ventaId,
  negocioId: "n1",
  campos: { cart_items: "[]", offline: "true" },
  vendidaEn,
  total: 1000,
  intentos: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
});

describe("sincronizarVentas", () => {
  it("saca de la cola solo lo que el server confirmó", async () => {
    ventasPendientes.mockResolvedValue([venta("v1", "2026-09-01T10:00:00Z")]);
    registrarVentaAction.mockResolvedValue({ success: true, error: null });

    const resultado = await sincronizarVentas("n1");

    expect(resultado.subidas).toBe(1);
    expect(quitarVentaPendiente).toHaveBeenCalledWith("v1");
  });

  it("una venta RECHAZADA por el server no se borra: alguien la tiene que ver", async () => {
    // Reintentar no la va a arreglar, pero borrarla sería tirar una venta que
    // ya se cobró en el mostrador.
    ventasPendientes.mockResolvedValue([venta("v1", "2026-09-01T10:00:00Z")]);
    registrarVentaAction.mockResolvedValue({
      success: false,
      error: "CAJA_CERRADA",
    });

    const resultado = await sincronizarVentas("n1");

    expect(resultado.subidas).toBe(0);
    expect(resultado.rechazadas).toEqual([
      { ventaId: "v1", error: "CAJA_CERRADA" },
    ]);
    expect(quitarVentaPendiente).not.toHaveBeenCalled();
    expect(marcarIntentoFallido).toHaveBeenCalledWith("v1", "CAJA_CERRADA");
  });

  it("un corte de red deja la venta en la cola, sin marcarla", async () => {
    // No es un problema de la venta: es la señal. Marcarla haría que una
    // vendedora vea un error donde solo hubo que esperar.
    ventasPendientes.mockResolvedValue([venta("v1", "2026-09-01T10:00:00Z")]);
    registrarVentaAction.mockRejectedValue(new Error("Failed to fetch"));

    const resultado = await sincronizarVentas("n1");

    expect(resultado.pendientes).toBe(1);
    expect(quitarVentaPendiente).not.toHaveBeenCalled();
    expect(marcarIntentoFallido).not.toHaveBeenCalled();
  });

  it("las sube en el orden en que se cobraron", async () => {
    ventasPendientes.mockResolvedValue([
      venta("temprana", "2026-09-01T10:00:00Z"),
      venta("tardia", "2026-09-01T18:00:00Z"),
    ]);
    registrarVentaAction.mockResolvedValue({ success: true, error: null });

    await sincronizarVentas("n1");

    expect(quitarVentaPendiente.mock.calls.map(([id]) => id)).toEqual([
      "temprana",
      "tardia",
    ]);
  });

  it("si la señal se corta a mitad de la cola, corta y deja el resto", async () => {
    ventasPendientes.mockResolvedValue([
      venta("v1", "2026-09-01T10:00:00Z"),
      venta("v2", "2026-09-01T11:00:00Z"),
      venta("v3", "2026-09-01T12:00:00Z"),
    ]);
    registrarVentaAction.mockImplementation(async () => {
      vi.stubGlobal("navigator", { onLine: false });
      return { success: true, error: null };
    });

    const resultado = await sincronizarVentas("n1");

    expect(resultado.subidas).toBe(1);
    expect(registrarVentaAction).toHaveBeenCalledTimes(1);
    expect(resultado.pendientes).toBe(2);
  });
});
