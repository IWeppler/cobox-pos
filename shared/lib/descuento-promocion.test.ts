import { describe, expect, it } from "vitest";
import {
  baseDescontable,
  calcularDescuentoPromocion,
  promocionAplica,
  promocionVigente,
  resolverDescuento,
  totalDeLineas,
  type PromocionCalculable,
} from "./descuento-promocion";

/** Las tres promociones vivas del SaaS al 8/9/2026, tal como están en la base. */
const DIEZ_POR_CIENTO_EFECTIVO: PromocionCalculable = {
  tipo_regla: "METODO_PAGO",
  tipo_descuento: "PORCENTAJE",
  valor_descuento: 10,
  monto_minimo: 0,
  activa: true,
};

const SIN_CONDICION: PromocionCalculable = {
  tipo_regla: null,
  tipo_descuento: "PORCENTAJE",
  valor_descuento: 10,
  monto_minimo: 0,
  activa: true,
};

const CARRITO = [
  { tipo: "REMERAS", precio: 12000, cantidad: 2 },
  { tipo: "JEANS", precio: 26000, cantidad: 1 },
]; // total: 50.000

describe("el total del carrito", () => {
  it("multiplica por cantidad, que es donde ya se equivocó el sistema antes", () => {
    // `ventas.cantidad` guardaba `items.length` y subcontaba las líneas de más
    // de una unidad. Acá el mismo error daría un descuento más chico.
    expect(totalDeLineas(CARRITO)).toBe(50000);
  });

  it("no rompe con basura", () => {
    expect(
      totalDeLineas([{ precio: NaN, cantidad: 1 }, { precio: 100, cantidad: 2 }]),
    ).toBe(200);
  });
});

describe("cuánto descuenta", () => {
  it("un porcentaje sale sobre el total del ticket", () => {
    expect(
      calcularDescuentoPromocion({ promo: SIN_CONDICION, lineas: CARRITO }),
    ).toBe(5000);
  });

  it("redondea al peso", () => {
    expect(
      calcularDescuentoPromocion({
        promo: { ...SIN_CONDICION, valor_descuento: 15 },
        lineas: [{ precio: 19990, cantidad: 1 }],
      }),
    ).toBe(2999); // 2998,5
  });

  it("un monto fijo no puede pasarse del total", () => {
    expect(
      calcularDescuentoPromocion({
        promo: {
          ...SIN_CONDICION,
          tipo_descuento: "MONTO_FIJO",
          valor_descuento: 90000,
        },
        lineas: CARRITO,
      }),
    ).toBe(50000);
  });

  it("por categoría sale sobre el subtotal de esa categoría, no del ticket", () => {
    expect(
      baseDescontable(
        { ...SIN_CONDICION, tipo_regla: "CATEGORIA" },
        CARRITO,
        ["jeans"],
      ),
    ).toBe(26000);

    expect(
      calcularDescuentoPromocion({
        promo: { ...SIN_CONDICION, tipo_regla: "CATEGORIA" },
        lineas: CARRITO,
        categorias: ["jeans"],
      }),
    ).toBe(2600);
  });

  it("un monto fijo por categoría se topea con la categoría, no con el ticket", () => {
    // Un descuento de $90.000 sobre una categoría cuyo subtotal es $26.000 no
    // puede llevarse puesto el resto del ticket.
    expect(
      calcularDescuentoPromocion({
        promo: {
          ...SIN_CONDICION,
          tipo_regla: "CATEGORIA",
          tipo_descuento: "MONTO_FIJO",
          valor_descuento: 90000,
        },
        lineas: CARRITO,
        categorias: ["jeans"],
      }),
    ).toBe(26000);
  });

  it("un valor negativo o absurdo no descuenta nada", () => {
    for (const valor of [-10, NaN, 0]) {
      expect(
        calcularDescuentoPromocion({
          promo: { ...SIN_CONDICION, valor_descuento: valor },
          lineas: CARRITO,
        }),
      ).toBe(0);
    }
  });

  it("un carrito vacío no descuenta nada", () => {
    expect(
      calcularDescuentoPromocion({ promo: SIN_CONDICION, lineas: [] }),
    ).toBe(0);
  });
});

describe("vigencia", () => {
  const ahora = new Date("2026-09-08T15:00:00Z");

  it("una promo apagada no descuenta", () => {
    // El caso que el server NO chequeaba: apagarla no impedía usarla desde un
    // POS que la tenía cargada de antes.
    expect(promocionVigente({ ...SIN_CONDICION, activa: false }, ahora)).toBe(
      false,
    );
  });

  it("respeta las fechas", () => {
    expect(
      promocionVigente(
        { ...SIN_CONDICION, fecha_inicio: "2026-09-09T00:00:00Z" },
        ahora,
      ),
    ).toBe(false);
    expect(
      promocionVigente(
        { ...SIN_CONDICION, fecha_fin: "2026-09-07T00:00:00Z" },
        ahora,
      ),
    ).toBe(false);
    expect(
      promocionVigente(
        {
          ...SIN_CONDICION,
          fecha_inicio: "2026-09-01T00:00:00Z",
          fecha_fin: "2026-09-30T00:00:00Z",
        },
        ahora,
      ),
    ).toBe(true);
  });

  it("respeta el límite de usos", () => {
    expect(
      promocionVigente(
        { ...SIN_CONDICION, limite_usos: 10, usos_actuales: 10 },
        ahora,
      ),
    ).toBe(false);
    expect(
      promocionVigente(
        { ...SIN_CONDICION, limite_usos: 10, usos_actuales: 9 },
        ahora,
      ),
    ).toBe(true);
  });

  it("sin límite ni fechas, está viva", () => {
    expect(promocionVigente(SIN_CONDICION, ahora)).toBe(true);
  });
});

describe("la condición", () => {
  it("una promo por método exige que TODOS los cobros sean de ese método", () => {
    const ctx = {
      promo: DIEZ_POR_CIENTO_EFECTIVO,
      lineas: CARRITO,
      metodosDeLaPromo: ["EFECTIVO", "TRANSFERENCIA"],
    };

    expect(promocionAplica({ ...ctx, tiposDePago: ["EFECTIVO"] })).toBe(true);
    expect(
      promocionAplica({ ...ctx, tiposDePago: ["EFECTIVO", "TRANSFERENCIA"] }),
    ).toBe(true);

    // Pago mixto: medio ticket en efectivo no gana el descuento del efectivo.
    expect(
      promocionAplica({ ...ctx, tiposDePago: ["EFECTIVO", "TARJETA"] }),
    ).toBe(false);
  });

  it("sin cobros no hay promo por método", () => {
    expect(
      promocionAplica({
        promo: DIEZ_POR_CIENTO_EFECTIVO,
        lineas: CARRITO,
        tiposDePago: [],
        metodosDeLaPromo: ["EFECTIVO"],
      }),
    ).toBe(false);
  });

  it("el monto mínimo vale para cualquier tipo_regla", () => {
    expect(
      promocionAplica({
        promo: { ...SIN_CONDICION, monto_minimo: 80000 },
        lineas: CARRITO,
      }),
    ).toBe(false);
    expect(
      promocionAplica({
        promo: { ...SIN_CONDICION, monto_minimo: 50000 },
        lineas: CARRITO,
      }),
    ).toBe(true);
  });

  it("por categoría necesita al menos un renglón de esa categoría", () => {
    const promo = { ...SIN_CONDICION, tipo_regla: "CATEGORIA" };
    expect(
      promocionAplica({ promo, lineas: CARRITO, categorias: ["jeans"] }),
    ).toBe(true);
    expect(
      promocionAplica({ promo, lineas: CARRITO, categorias: ["camperas"] }),
    ).toBe(false);
  });

  it("un tipo_regla desconocido NO descuenta (fail-closed)", () => {
    // Mismo criterio que los CHECK de rubro, egresos.tipo y modo_facturacion:
    // lo que este código no entiende no mueve plata.
    expect(
      promocionAplica({
        promo: { ...SIN_CONDICION, tipo_regla: "POR_CLIENTE_MAYORISTA" },
        lineas: CARRITO,
      }),
    ).toBe(false);
  });
});

describe("resolverDescuento: lo que decide el server", () => {
  it("la promo real de Evens sobre un ticket real", () => {
    expect(
      resolverDescuento({
        promo: DIEZ_POR_CIENTO_EFECTIVO,
        lineas: CARRITO,
        tiposDePago: ["EFECTIVO"],
        metodosDeLaPromo: ["EFECTIVO"],
      }),
    ).toEqual({ monto: 5000, motivo: null });
  });

  it("dice POR QUÉ no descontó, para que quede en el log", () => {
    expect(
      resolverDescuento({
        promo: { ...SIN_CONDICION, activa: false },
        lineas: CARRITO,
      }).motivo,
    ).toBe("VIGENCIA");

    expect(
      resolverDescuento({
        promo: DIEZ_POR_CIENTO_EFECTIVO,
        lineas: CARRITO,
        tiposDePago: ["TARJETA"],
        metodosDeLaPromo: ["EFECTIVO"],
      }).motivo,
    ).toBe("CONDICION");

    expect(
      resolverDescuento({
        promo: { ...SIN_CONDICION, valor_descuento: 0 },
        lineas: CARRITO,
      }).motivo,
    ).toBe("MONTO");
  });

  it("el monto que devuelve es el TECHO de lo que la venta puede descontar", () => {
    // Es el agujero que este módulo vino a cerrar: `create-sale.ts` tomaba
    // `descuento_monto` del FormData y lo usaba tal cual, así que un request
    // con un descuento inventado se cobraba solo. Ahora el server calcula su
    // propio número y lo que pida el cliente por encima de esto se rechaza.
    const { monto } = resolverDescuento({
      promo: SIN_CONDICION,
      lineas: CARRITO,
    });

    const pedidoPorUnClienteModificado = 49_000;
    expect(Math.min(pedidoPorUnClienteModificado, monto)).toBe(5000);
  });
});
