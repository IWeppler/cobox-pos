import { describe, it, expect } from "vitest";
import { getAdvisorInsights, type AdvisorMetrics } from "./get-advisor-insights";

function baseMetrics(overrides: Partial<AdvisorMetrics> = {}): AdvisorMetrics {
  return {
    ingresos: 100000,
    ordenes: 20,
    unidadesVendidas: 50,
    gananciaBrutaVentas: 40000,
    gananciaNeta: 20000,
    totalEgresos: 1000,
    costoPerdidoBajas: 0,
    unidadesBajas: 0,
    margenPorcentaje: 20,
    ticketPromedio: 5000,
    stockValorizadoCosto: 10000,
    stockTotalUnidades: 100,
    productosCriticos: 0,
    productosSinMovimiento: [],
    topProductos: [],
    topProductosRentables: [],
    ventasPorDia: [],
    ventasPorCategoria: [],
    ...overrides,
  };
}

describe("getAdvisorInsights — guardia de confianza", () => {
  it("con menos de 3 órdenes, solo devuelve el insight de onboarding", () => {
    const r = getAdvisorInsights(baseMetrics({ ordenes: 2 }));
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("onboarding");
  });
});

describe("getAdvisorInsights — deuda vencida (nueva regla)", () => {
  it("sin deudaVencida en el input, no agrega ningún insight de deuda", () => {
    const r = getAdvisorInsights(baseMetrics());
    expect(r.some((i) => i.id === "deuda_vencida")).toBe(false);
  });

  it("con deudaVencida.monto en 0, no agrega insight (guard > 0)", () => {
    const r = getAdvisorInsights(
      baseMetrics({ deudaVencida: { monto: 0, clientes: 0 } }),
    );
    expect(r.some((i) => i.id === "deuda_vencida")).toBe(false);
  });

  it("deuda vencida moderada (< 50% ingresos y < $50k) es warning", () => {
    const r = getAdvisorInsights(
      baseMetrics({ deudaVencida: { monto: 10000, clientes: 2 } }),
    );
    const insight = r.find((i) => i.id === "deuda_vencida");
    expect(insight?.type).toBe("warning");
    expect(insight?.priority).toBe(72);
    expect(insight?.href).toBe("/clientes");
  });

  it("deuda vencida > 50% de los ingresos del período es danger", () => {
    const r = getAdvisorInsights(
      baseMetrics({ deudaVencida: { monto: 60000, clientes: 3 } }),
    );
    const insight = r.find((i) => i.id === "deuda_vencida");
    expect(insight?.type).toBe("danger");
    expect(insight?.priority).toBe(92);
  });

  it("deuda vencida > $50k absolutos es danger aunque sea < 50% de ingresos altos", () => {
    const r = getAdvisorInsights(
      baseMetrics({ ingresos: 500000, deudaVencida: { monto: 55000, clientes: 3 } }),
    );
    const insight = r.find((i) => i.id === "deuda_vencida");
    expect(insight?.type).toBe("danger");
  });

  it("con ingresos=0 y deuda>0, se considera 100% proporcional -> danger", () => {
    const r = getAdvisorInsights(
      baseMetrics({ ingresos: 0, deudaVencida: { monto: 1000, clientes: 1 } }),
    );
    const insight = r.find((i) => i.id === "deuda_vencida");
    expect(insight?.type).toBe("danger");
  });

  it("el mensaje pluraliza 'cliente' correctamente", () => {
    const uno = getAdvisorInsights(
      baseMetrics({ deudaVencida: { monto: 5000, clientes: 1 } }),
    ).find((i) => i.id === "deuda_vencida");
    const varios = getAdvisorInsights(
      baseMetrics({ deudaVencida: { monto: 5000, clientes: 3 } }),
    ).find((i) => i.id === "deuda_vencida");
    expect(uno?.message).toContain("1 cliente");
    expect(uno?.message).not.toContain("1 clientes");
    expect(varios?.message).toContain("3 clientes");
  });
});

describe("getAdvisorInsights — remitos pendientes (nueva regla)", () => {
  it("sin remitosPendientes en el input, no agrega insight", () => {
    const r = getAdvisorInsights(baseMetrics());
    expect(r.some((i) => i.id === "remitos_pendientes")).toBe(false);
  });

  it("con cantidad 0, no agrega insight", () => {
    const r = getAdvisorInsights(
      baseMetrics({
        remitosPendientes: { cantidad: 0, diasMasAntiguo: 0, idMasAntiguo: "" },
      }),
    );
    expect(r.some((i) => i.id === "remitos_pendientes")).toBe(false);
  });

  it("con remitos pendientes, agrega warning de prioridad media con link al más antiguo", () => {
    const r = getAdvisorInsights(
      baseMetrics({
        remitosPendientes: { cantidad: 2, diasMasAntiguo: 5, idMasAntiguo: "orden-123" },
      }),
    );
    const insight = r.find((i) => i.id === "remitos_pendientes");
    expect(insight?.type).toBe("warning");
    expect(insight?.priority).toBe(58);
    expect(insight?.href).toBe("/compras/merge/orden-123");
    expect(insight?.message).toContain("2 remitos");
    expect(insight?.message).toContain("5 días");
  });

  it("singular correcto con 1 remito y 1 día", () => {
    const insight = getAdvisorInsights(
      baseMetrics({
        remitosPendientes: { cantidad: 1, diasMasAntiguo: 1, idMasAntiguo: "o1" },
      }),
    ).find((i) => i.id === "remitos_pendientes");
    expect(insight?.message).toContain("1 remito ");
    expect(insight?.message).toContain("1 día.");
  });
});

describe("getAdvisorInsights — integración con el corte a top-3 existente", () => {
  it("las reglas nuevas compiten por prioridad junto a las 10 originales, top-3 final", () => {
    const r = getAdvisorInsights(
      baseMetrics({
        margenPorcentaje: -5, // priority 100
        productosCriticos: 2, // priority 85
        deudaVencida: { monto: 60000, clientes: 2 }, // priority 92 (danger, >50k)
        remitosPendientes: { cantidad: 1, diasMasAntiguo: 10, idMasAntiguo: "o1" }, // priority 58
      }),
    );
    expect(r).toHaveLength(3);
    expect(r.map((i) => i.id)).toEqual([
      "margin_negative",
      "deuda_vencida",
      "stock_critical",
    ]);
  });

  it("no rompe la regla de felicitaciones: deuda vencida cuenta como warning/danger y tapa el confeti", () => {
    const r = getAdvisorInsights(
      baseMetrics({
        margenPorcentaje: 40, // dispararía good_margin si no hubiera warnings
        deudaVencida: { monto: 10000, clientes: 1 }, // warning
      }),
    );
    expect(r.some((i) => i.id === "good_margin")).toBe(false);
  });
});
