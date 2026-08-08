import { describe, expect, it } from "vitest";
import {
  filasComprobantes,
  filasMovimientosCaja,
  filasMovimientosGenerales,
  filasVentas,
  formatearFechaHoraExport,
  num,
} from "./construir-filas";

describe("formatearFechaHoraExport", () => {
  it("usa un formato que Excel no puede interpretar al revés", () => {
    // 03/04 es marzo o abril según la configuración regional de quien abre el
    // archivo. Con ISO no hay ambigüedad posible.
    const r = formatearFechaHoraExport("2026-04-03T15:30:00");
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(r.startsWith("2026-04-03")).toBe(true);
  });

  it("una fecha inválida da vacío, no 'Invalid Date'", () => {
    expect(formatearFechaHoraExport("cualquier cosa")).toBe("");
    expect(formatearFechaHoraExport(null)).toBe("");
    expect(formatearFechaHoraExport(undefined)).toBe("");
  });
});

describe("num", () => {
  it("nunca devuelve NaN: un NaN rompe la suma de la planilla entera", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("")).toBe(0);
    expect(num("no es un número")).toBe(0);
    expect(num("1234.56")).toBe(1234.56);
  });
});

describe("filasVentas", () => {
  const venta = {
    id: "v-1",
    fecha_venta: "2026-08-08T10:00:00",
    estado_operacion: "CONFIRMADA",
    estado_pago: "PAGADA",
    metodo_pago: "TARJETA",
    total: 12100,
    recargo_metodo_total: 2100,
    precio_costo: 5000,
    comision_total: 363,
    total_neto: 11737,
    monto_cobrado: 12100,
    monto_pendiente: 0,
    cantidad: 2,
    clientes: { nombre: "Juan Pérez" },
    perfiles: { nombre: "Mara" },
    comprobantes: [{ tipo: "TICKET", punto_venta: 1, numero: 42 }],
  };

  it("separa la venta de mercadería del recargo por medio de pago", () => {
    // El recargo no es venta: si se sumara como tal, el contador vería
    // facturación de más y un margen inflado.
    const [f] = filasVentas([venta]);
    expect(f["Total cobrado"]).toBe(12100);
    expect(f["Recargo por medio de pago"]).toBe(2100);
    expect(f["Venta de mercadería"]).toBe(10000);
  });

  it("los importes van como número, no como texto con $", () => {
    const [f] = filasVentas([venta]);
    for (const col of [
      "Total cobrado",
      "Venta de mercadería",
      "Costo de la mercadería",
      "Neto acreditado",
    ]) {
      expect(typeof f[col]).toBe("number");
    }
  });

  it("imprime el número de comprobante con su formato", () => {
    const [f] = filasVentas([venta]);
    expect(f.Comprobante).toBe("0001-00000042");
    expect(f["Tipo comprobante"]).toBe("TICKET");
  });

  it("una venta sin comprobante no rompe: deja las columnas vacías", () => {
    // Son las ventas anteriores a que existiera la tabla.
    const [f] = filasVentas([{ ...venta, comprobantes: null }]);
    expect(f.Comprobante).toBe("");
    expect(f["Tipo comprobante"]).toBe("");
  });

  it("sin cliente dice consumidor final, no vacío", () => {
    const [f] = filasVentas([{ ...venta, clientes: null }]);
    expect(f.Cliente).toBe("Consumidor final");
  });

  it("una venta ANULADA aparece y se ve que lo está", () => {
    // Sacarla dejaría huecos sin explicación en la numeración.
    const [f] = filasVentas([{ ...venta, estado_operacion: "ANULADA" }]);
    expect(f.Estado).toBe("ANULADA");
  });
});

describe("filasComprobantes", () => {
  it("exporta el CAE vacío cuando no hay: un ticket interno no lo tiene", () => {
    const [f] = filasComprobantes([
      {
        tipo: "TICKET",
        punto_venta: 1,
        numero: 7,
        emitido_en: "2026-08-08T12:00:00",
        total: 5000,
        neto: 0,
        iva_monto: 0,
        cae: null,
        cae_vencimiento: null,
        receptor_razon_social: null,
        receptor_cuit: null,
        receptor_condicion_iva: null,
        venta_id: "v-1",
      },
    ]);

    expect(f.CAE).toBe("");
    expect(f["Vencimiento CAE"]).toBe("");
    expect(f.Número).toBe("0001-00000007");
    expect(f.Receptor).toBe("Consumidor final");
    expect(f.Total).toBe(5000);
  });
});

describe("filasMovimientosCaja", () => {
  it("exporta el arqueo con su diferencia", () => {
    const [f] = filasMovimientosCaja([
      {
        id: "t-1",
        fecha_apertura: "2026-08-08T09:00:00",
        fecha_cierre: "2026-08-08T21:00:00",
        estado: "CERRADO",
        modo: "POR_USUARIO",
        monto_inicial: 10000,
        efectivo_esperado: 55000,
        monto_declarado: 54800,
        diferencia: -200,
        observacion_cierre: "Faltante chico",
        perfiles: { nombre: "Brisa" },
      },
    ]);

    expect(f.Responsable).toBe("Brisa");
    expect(f["Efectivo esperado"]).toBe(55000);
    expect(f.Diferencia).toBe(-200);
  });
});

describe("filasMovimientosGenerales", () => {
  const pago = {
    creado_en: "2026-08-08T11:00:00",
    metodo_nombre: "Efectivo",
    metodo_tipo: "EFECTIVO",
    monto_base: 10000,
    recargo_monto: 0,
    monto_bruto: 10000,
    comision_monto: 0,
    monto_neto: 10000,
    tipo_movimiento: "PAGO_VENTA",
    estado_pago_operacion: "CONFIRMADO",
    venta_id: "v-1",
  };

  const egreso = {
    fecha: "2026-08-08T10:00:00",
    concepto: "Flete",
    monto: 3000,
    tipo: "OPERATIVO",
  };

  it("el egreso va negativo para que la columna sume el neto sola", () => {
    const filas = filasMovimientosGenerales([pago], [egreso]);
    const salida = filas.find((f) => f.Movimiento === "EGRESO");
    expect(salida?.Importe).toBe(-3000);

    const total = filas.reduce((acc, f) => acc + Number(f.Importe ?? 0), 0);
    expect(total).toBe(7000);
  });

  it("un egreso ya negativo no se vuelve positivo", () => {
    const filas = filasMovimientosGenerales([], [{ ...egreso, monto: -3000 }]);
    expect(filas[0].Importe).toBe(-3000);
  });

  it("mezcla ingresos y egresos ordenados por fecha", () => {
    const filas = filasMovimientosGenerales([pago], [egreso]);
    expect(filas.map((f) => f.Movimiento)).toEqual(["EGRESO", "INGRESO"]);
  });

  it("distingue el cobro de cuenta corriente del cobro de venta", () => {
    const filas = filasMovimientosGenerales(
      [{ ...pago, tipo_movimiento: "PAGO_CUENTA_CORRIENTE" }],
      [],
    );
    expect(filas[0].Concepto).toBe("Cobro de cuenta corriente");
  });
});
