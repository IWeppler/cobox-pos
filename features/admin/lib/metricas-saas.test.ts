import { describe, expect, it } from "vitest";
import {
  calcularArpu,
  calcularChurnMensual,
  calcularLtv,
  resumirCostos,
  type NegocioParaMetricas,
} from "./metricas-saas";

const AGOSTO = new Date("2026-08-14T12:00:00Z");

function negocio(over: Partial<NegocioParaMetricas> = {}): NegocioParaMetricas {
  return {
    estado: "activo",
    created_at: "2026-01-01T00:00:00Z",
    estado_cambiado_en: null,
    ...over,
  };
}

/** 12 comercios viejos, para superar el mínimo estadístico. */
function cartera(cantidad: number): NegocioParaMetricas[] {
  return Array.from({ length: cantidad }, () => negocio());
}

describe("calcularArpu", () => {
  it("divide lo cobrado por los comercios activos", () => {
    expect(calcularArpu(400_000, 10).valor).toBe(40_000);
  });

  it("sin comercios no inventa un promedio", () => {
    const arpu = calcularArpu(0, 0);
    expect(arpu.valor).toBeNull();
    expect(arpu.motivo).toContain("Todavía no hay comercios");
  });
});

describe("calcularChurnMensual", () => {
  it("se niega a publicar la tasa con la cartera actual", () => {
    // EL caso que motiva el módulo: con 4 comercios, una baja da 25% mensual,
    // que proyectado dice que el negocio se termina en cuatro meses.
    const churn = calcularChurnMensual(
      [
        ...cartera(3),
        negocio({ estado: "baja", estado_cambiado_en: "2026-08-05T00:00:00Z" }),
      ],
      AGOSTO,
    );
    expect(churn.valor).toBeNull();
    expect(churn.motivo).toContain("al menos 10");
    expect(churn.motivo).toContain("hay 4");
  });

  it("con cartera suficiente calcula sobre los activos AL INICIO del mes", () => {
    // 12 al empezar, 1 se va: 1/12. Dividir por los 11 que quedan daría 9,1% —
    // una tasa más baja que la real.
    const churn = calcularChurnMensual(
      [
        ...cartera(11),
        negocio({ estado: "baja", estado_cambiado_en: "2026-08-05T00:00:00Z" }),
      ],
      AGOSTO,
    );
    expect(churn.valor).toBeCloseTo((1 / 12) * 100, 5);
  });

  it("los de alta DENTRO del mes no entran en la base", () => {
    const churn = calcularChurnMensual(
      [...cartera(12), negocio({ created_at: "2026-08-10T00:00:00Z" })],
      AGOSTO,
    );
    // 12 al inicio, 0 bajas.
    expect(churn.valor).toBe(0);
  });

  it("una baja de un mes anterior no cuenta dos veces", () => {
    const churn = calcularChurnMensual(
      [
        ...cartera(12),
        negocio({ estado: "baja", estado_cambiado_en: "2026-06-05T00:00:00Z" }),
      ],
      AGOSTO,
    );
    // El que se fue en junio no estaba activo al empezar agosto ni se fue en
    // agosto: no toca ni el numerador ni el denominador.
    expect(churn.valor).toBe(0);
  });
});

describe("calcularLtv", () => {
  it("sin bajas no hay LTV, aunque la cuenta 'funcione'", () => {
    // ARPU / 0 es infinito: "cada cliente vale infinito" es la ausencia de un
    // dato, no un dato.
    const ltv = calcularLtv({ valor: 40_000 }, { valor: 0 });
    expect(ltv.valor).toBeNull();
    expect(ltv.motivo).toContain("no se fue ningún comercio");
  });

  it("con churn medible estima los meses de vida", () => {
    // 5% mensual = 20 meses de vida promedio.
    const ltv = calcularLtv({ valor: 40_000 }, { valor: 5 });
    expect(ltv.valor).toBe(800_000);
  });

  it("hereda el motivo de la métrica que falta", () => {
    const ltv = calcularLtv({ valor: 40_000 }, { valor: null, motivo: "poca muestra" });
    expect(ltv.valor).toBeNull();
    expect(ltv.motivo).toBe("poca muestra");
  });
});

describe("resumirCostos", () => {
  it("calcula margen y costo por comercio", () => {
    const resumen = resumirCostos(
      [
        { proveedor: "Vercel", monto: 20_000 },
        { proveedor: "Supabase", monto: 25_000 },
      ],
      200_000,
      4,
    );

    expect(resumen.total).toBe(45_000);
    expect(resumen.porComercio).toBe(11_250);
    expect(resumen.margen).toBe(155_000);
    expect(resumen.margenPorcentaje).toBeCloseTo(77.5, 5);
  });

  it("el margen negativo se muestra, no se esconde", () => {
    // Es el número que dice si el precio alcanza.
    const resumen = resumirCostos([{ proveedor: "Supabase", monto: 90_000 }], 60_000, 2);
    expect(resumen.margen).toBe(-30_000);
    expect(resumen.margenPorcentaje).toBeCloseTo(-50, 5);
  });

  it("sin ingresos no hay porcentaje de margen", () => {
    // Dividir por cero daría -Infinity, que no le dice nada a nadie.
    const resumen = resumirCostos([{ proveedor: "Vercel", monto: 20_000 }], 0, 0);
    expect(resumen.margenPorcentaje).toBeNull();
    expect(resumen.porComercio).toBeNull();
    expect(resumen.margen).toBe(-20_000);
  });
});
