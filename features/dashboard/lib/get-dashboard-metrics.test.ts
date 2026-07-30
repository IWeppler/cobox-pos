import { describe, expect, it } from "vitest";
import { getDashboardMetrics } from "./get-dashboard-metrics";
import type { Venta, VentaPago } from "@/entities/ventas/types";

/**
 * Cobertura de la plata financiera del dashboard: recargo por método (que NO
 * es venta de mercadería) y comisiones de los cobros de cuenta corriente (que
 * antes se veían en Caja pero no acá, sobreestimando la ganancia).
 *
 * Todo con periodo "historico" para que el filtro de fechas no participe.
 */

const ventaBase = {
  id: "v1",
  cantidad: 1,
  fecha_venta: "2026-07-30T12:00:00Z",
  estado_operacion: "CONFIRMADA",
  estado_pago: "PAGADA",
} as unknown as Venta;

const metricas = (ventas: Venta[], pagosCC: VentaPago[] = []) =>
  getDashboardMetrics(
    ventas,
    [],
    [],
    [],
    "historico",
    undefined,
    undefined,
    pagosCC,
  );

describe("recargo por método en las métricas", () => {
  it("no cuenta el recargo como venta de mercadería", () => {
    // Ticket de $10.000 de mercadería + $1.500 de recargo, costo $6.000.
    const m = metricas([
      {
        ...ventaBase,
        total: 11500,
        recargo_metodo_total: 1500,
        precio_costo: 6000,
      } as unknown as Venta,
    ]);

    expect(m.ingresos).toBe(10000);
    expect(m.gananciaBrutaVentas).toBe(4000);
    expect(m.recargosCobrados).toBe(1500);
  });

  it("mantiene la identidad ingresos - gananciaBruta = costo de mercadería", () => {
    // Es la resta que hace reportes/page.tsx para mostrar el costo.
    const m = metricas([
      {
        ...ventaBase,
        total: 11500,
        recargo_metodo_total: 1500,
        precio_costo: 6000,
      } as unknown as Venta,
    ]);

    expect(m.ingresos - m.gananciaBrutaVentas).toBe(6000);
  });

  it("suma el recargo a la ganancia neta, del lado de la comisión que compensa", () => {
    const m = metricas([
      {
        ...ventaBase,
        total: 11500,
        recargo_metodo_total: 1500,
        precio_costo: 6000,
        venta_pagos: [
          {
            metodo_nombre: "Tarjeta",
            metodo_tipo: "TARJETA",
            monto_bruto: 11500,
            recargo_monto: 1500,
            comision_monto: 1000,
            monto_neto: 10500,
            acreditacion_dias: 0,
          },
        ],
      } as unknown as Venta,
    ]);

    // 4.000 de margen + 1.500 de recargo - 1.000 de comisión.
    expect(m.gananciaNeta).toBe(4500);
  });
});

describe("cobros de cuenta corriente", () => {
  const cobroConTarjeta = {
    id: "p1",
    metodo_nombre: "Tarjeta",
    metodo_tipo: "TARJETA",
    monto_base: 10000,
    recargo_porcentaje: 15,
    recargo_monto: 1500,
    monto_bruto: 11500,
    comision_porcentaje: 6,
    comision_monto: 690,
    monto_neto: 10810,
    acreditacion_dias: 0,
    tipo_movimiento: "PAGO_CUENTA_CORRIENTE",
    creado_en: "2026-07-30T18:00:00Z",
  } as unknown as VentaPago;

  it("descuenta su comisión de la ganancia neta", () => {
    const sinCobro = metricas([]);
    const conCobro = metricas([], [cobroConTarjeta]);

    expect(sinCobro.totalComisiones).toBe(0);
    expect(conCobro.totalComisiones).toBe(690);
    // Recargo cobrado (1.500) menos comisión (690).
    expect(conCobro.gananciaNeta - sinCobro.gananciaNeta).toBe(810);
  });

  it("no suma el capital cobrado a ingresos (ya lo contó la venta fiada)", () => {
    const m = metricas([], [cobroConTarjeta]);

    expect(m.ingresos).toBe(0);
    expect(m.cobrosCuentaCorriente).toBe(11500);
  });

  it("aparece en el desglose por método, para que cierre contra Caja", () => {
    const m = metricas([], [cobroConTarjeta]);
    const tarjeta = m.ventasPorMetodo.find((x) => x.label === "Tarjeta");

    expect(tarjeta).toEqual({ label: "Tarjeta", bruto: 11500, comision: 690, neto: 10810 });
  });

  it("ignora los cobros anulados", () => {
    const m = metricas(
      [],
      [{ ...cobroConTarjeta, estado_pago_operacion: "ANULADO" } as VentaPago],
    );

    expect(m.totalComisiones).toBe(0);
    expect(m.cobrosCuentaCorriente).toBe(0);
  });
});
