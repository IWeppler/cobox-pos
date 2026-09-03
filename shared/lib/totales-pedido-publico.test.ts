import { describe, expect, it } from "vitest";
import {
  calcularTotalesPedido,
  mejorDescuentoPorMetodo,
} from "./totales-pedido-publico";
import { generarLinkWhatsAppPublico } from "@/shared/components/cart-sidebar/cart-sidebar-utils";
import type { OpcionPagoPublica } from "./opciones-pago-publicas";
import type { CartItemStore } from "@/entities/cart/types";
import type { PromocionDB } from "@/shared/components/cart-sidebar/types";

const item = (precio: number, cantidad = 1): CartItemStore =>
  ({
    productoId: `p-${precio}-${cantidad}`,
    variante: "M",
    nombre: "Remera",
    tipo: "REMERAS",
    precio,
    cantidad,
  }) as CartItemStore;

const promo = (p: Partial<PromocionDB>): PromocionDB => ({
  id: p.id ?? "promo-1",
  nombre: p.nombre ?? "Promo",
  tipo_regla: p.tipo_regla ?? null,
  tipo_descuento: p.tipo_descuento ?? "PORCENTAJE",
  valor_descuento: p.valor_descuento ?? 10,
  monto_minimo: p.monto_minimo ?? 0,
  mostrar_en_catalogo: p.mostrar_en_catalogo ?? true,
  acumulable: p.acumulable ?? false,
  prioridad: p.prioridad ?? 0,
  promociones_metodos_pago: p.promociones_metodos_pago,
  promociones_categorias: p.promociones_categorias,
});

const EFECTIVO: OpcionPagoPublica = {
  tipo: "EFECTIVO",
  etiqueta: "Efectivo",
  recargoPorcentaje: 0,
};
const TARJETA_15: OpcionPagoPublica = {
  tipo: "TARJETA",
  etiqueta: "Tarjeta",
  recargoPorcentaje: 15,
};

describe("calcularTotalesPedido", () => {
  it("sin método elegido no muestra descuento ni recargo, aunque la promo aplique", () => {
    const totales = calcularTotalesPedido({
      items: [item(20000)],
      promociones: [promo({ valor_descuento: 20 })],
      opcionPago: null,
    });

    expect(totales.subtotal).toBe(20000);
    expect(totales.descuento).toBeNull();
    expect(totales.recargo).toBeNull();
    expect(totales.total).toBe(20000);
    expect(totales.promosAplicadas).toEqual([]);
  });

  it("con efectivo aplica la promo por método y la nombra por el medio de pago", () => {
    const totales = calcularTotalesPedido({
      items: [item(20000)],
      promociones: [
        promo({
          tipo_regla: "METODO_PAGO",
          valor_descuento: 10,
          promociones_metodos_pago: [{ metodo_pago: "EFECTIVO" }],
        }),
      ],
      opcionPago: EFECTIVO,
    });

    expect(totales.descuento).toEqual({
      etiqueta: "Descuento efectivo",
      monto: 2000,
    });
    expect(totales.total).toBe(18000);
  });

  it("una promo por método que no es la del tipo elegido no se aplica", () => {
    const totales = calcularTotalesPedido({
      items: [item(20000)],
      promociones: [
        promo({
          tipo_regla: "METODO_PAGO",
          valor_descuento: 10,
          promociones_metodos_pago: [{ metodo_pago: "EFECTIVO" }],
        }),
      ],
      opcionPago: TARJETA_15,
    });

    expect(totales.descuento).toBeNull();
    // Sin descuento, el recargo va sobre el subtotal entero.
    expect(totales.recargo?.monto).toBe(3000);
    expect(totales.total).toBe(23000);
  });

  it("descuento y recargo son renglones SEPARADOS, nunca un neto", () => {
    // El caso de Evens: 30% OFF con tarjeta y 15% de recargo con tarjeta.
    const totales = calcularTotalesPedido({
      items: [item(20000)],
      promociones: [
        promo({
          tipo_regla: "METODO_PAGO",
          valor_descuento: 30,
          promociones_metodos_pago: [{ metodo_pago: "TARJETA" }],
        }),
      ],
      opcionPago: TARJETA_15,
    });

    expect(totales.descuento?.monto).toBe(6000);
    expect(totales.recargo?.etiqueta).toBe("Recargo tarjeta (15%)");
    // El recargo va sobre la BASE (14.000), no sobre el subtotal (20.000):
    // 2.100 y no 3.000.
    expect(totales.recargo?.monto).toBe(2100);
    expect(totales.total).toBe(16100);
  });

  it("el envío se suma al final y NO paga recargo", () => {
    const totales = calcularTotalesPedido({
      items: [item(20000)],
      promociones: [],
      opcionPago: TARJETA_15,
      costoEnvio: 1500,
    });

    expect(totales.envio).toEqual({ etiqueta: "Envío", monto: 1500 });
    // 20.000 + 3.000 de recargo + 1.500 de envío. Si el envío pagara recargo
    // serían 225 pesos más, que es cobrar comisión sobre el flete.
    expect(totales.total).toBe(24500);
  });

  it("entre promos exclusivas gana la que más descuenta", () => {
    // Evens real: una general de 20% y una de efectivo de 10%, las dos no
    // acumulables.
    const totales = calcularTotalesPedido({
      items: [item(20000)],
      promociones: [
        promo({ id: "general", valor_descuento: 20 }),
        promo({
          id: "efectivo",
          tipo_regla: "METODO_PAGO",
          valor_descuento: 10,
          promociones_metodos_pago: [{ metodo_pago: "EFECTIVO" }],
        }),
      ],
      opcionPago: EFECTIVO,
    });

    expect(totales.descuento?.monto).toBe(4000);
    expect(totales.promosAplicadas.map((p) => p.id)).toEqual(["general"]);
  });

  it("una promo que el comercio no publica en el catálogo no se aplica acá", () => {
    const totales = calcularTotalesPedido({
      items: [item(20000)],
      promociones: [promo({ valor_descuento: 50, mostrar_en_catalogo: false })],
      opcionPago: EFECTIVO,
    });

    expect(totales.descuento).toBeNull();
  });

  it("el subtotal multiplica por cantidad", () => {
    const totales = calcularTotalesPedido({
      items: [item(5000, 3), item(2000, 2)],
      promociones: [],
      opcionPago: null,
    });

    expect(totales.subtotal).toBe(19000);
  });

  it("el recargo se redondea al peso, igual que en el mostrador", () => {
    const totales = calcularTotalesPedido({
      items: [item(999)],
      promociones: [],
      opcionPago: { tipo: "TARJETA", etiqueta: "Tarjeta", recargoPorcentaje: 15 },
    });

    expect(totales.recargo?.monto).toBe(150);
    expect(totales.total).toBe(1149);
  });
});

describe("mejorDescuentoPorMetodo", () => {
  const EFECTIVO_10 = promo({
    id: "efectivo",
    tipo_regla: "METODO_PAGO",
    valor_descuento: 10,
    promociones_metodos_pago: [{ metodo_pago: "EFECTIVO" }],
  });

  const OPCIONES: OpcionPagoPublica[] = [
    EFECTIVO,
    { tipo: "TRANSFERENCIA", etiqueta: "Transferencia", recargoPorcentaje: 0 },
    TARJETA_15,
  ];

  it("no devuelve nada si el negocio no tiene ninguna promo por método", () => {
    // Una promo general no alcanza: la anotación habla de pagar de una manera.
    expect(
      mejorDescuentoPorMetodo({
        precio: 20000,
        promociones: [promo({ valor_descuento: 20 })],
        opcionesPago: OPCIONES,
      }),
    ).toBeNull();
  });

  it("ignora el método con MAYOR descuento si además cobra recargo", () => {
    // Evens real: 30% OFF con tarjeta y 15% de recargo con tarjeta. Anunciar
    // $14.000 sería prometer un precio que el desglose no da (serían $16.100).
    const resultado = mejorDescuentoPorMetodo({
      precio: 20000,
      promociones: [
        EFECTIVO_10,
        promo({
          id: "tarjeta",
          tipo_regla: "METODO_PAGO",
          valor_descuento: 30,
          promociones_metodos_pago: [{ metodo_pago: "TARJETA" }],
        }),
      ],
      opcionesPago: OPCIONES,
    });

    expect(resultado).toEqual({
      precio: 18000,
      ahorro: 2000,
      porcentaje: 10,
      metodo: "efectivo",
    });
  });

  it("entre métodos sin recargo se queda con el mejor precio", () => {
    const resultado = mejorDescuentoPorMetodo({
      precio: 20000,
      promociones: [
        EFECTIVO_10,
        promo({
          id: "transferencia",
          tipo_regla: "METODO_PAGO",
          valor_descuento: 25,
          promociones_metodos_pago: [{ metodo_pago: "TRANSFERENCIA" }],
        }),
      ],
      opcionesPago: OPCIONES,
    });

    expect(resultado).toEqual({
      precio: 15000,
      ahorro: 5000,
      porcentaje: 25,
      metodo: "transferencia",
    });
  });

  it("el porcentaje del badge sale del PRECIO, no de la promo que ganó", () => {
    // Evens real: gana la general del 20% sobre la de efectivo del 10%. El
    // badge tiene que decir 20, que es lo que la clienta va a ahorrar, y no 10,
    // que es el valor de la promo que habilita la anotación.
    const resultado = mejorDescuentoPorMetodo({
      precio: 20000,
      promociones: [EFECTIVO_10, promo({ id: "general", valor_descuento: 20 })],
      opcionesPago: OPCIONES,
    });

    expect(resultado?.porcentaje).toBe(20);
    expect(resultado?.precio).toBe(16000);
  });

  it("sin porcentaje exacto devuelve null y el badge muestra la plata", () => {
    // $2.000 sobre $17.350 son 11,53%: "12% OFF" daría $2.082 y la cuenta no
    // cerraría con el precio de al lado.
    const resultado = mejorDescuentoPorMetodo({
      precio: 17350,
      promociones: [
        { ...EFECTIVO_10, tipo_descuento: "FIJO", valor_descuento: 2000 },
      ],
      opcionesPago: OPCIONES,
    });

    expect(resultado?.ahorro).toBe(2000);
    expect(resultado?.porcentaje).toBeNull();
  });

  it("un porcentaje sigue siendo exacto aunque el redondeo mueva el ahorro", () => {
    // 15% de $17.350 son $2.602,50 → $2.603. El porcentaje derivado da
    // 15,0029, pero 15% reproduce ese mismo ahorro al peso, así que vale.
    const resultado = mejorDescuentoPorMetodo({
      precio: 17350,
      promociones: [{ ...EFECTIVO_10, valor_descuento: 15 }],
      opcionesPago: OPCIONES,
    });

    expect(resultado?.ahorro).toBe(2603);
    expect(resultado?.porcentaje).toBe(15);
  });

  it("no muestra nada en un producto por debajo del monto mínimo de la promo", () => {
    expect(
      mejorDescuentoPorMetodo({
        precio: 5000,
        promociones: [{ ...EFECTIVO_10, monto_minimo: 20000 }],
        opcionesPago: OPCIONES,
      }),
    ).toBeNull();
  });

  it("no muestra nada si el negocio no tiene métodos sin recargo", () => {
    expect(
      mejorDescuentoPorMetodo({
        precio: 20000,
        promociones: [EFECTIVO_10],
        opcionesPago: [TARJETA_15],
      }),
    ).toBeNull();
  });

  it("una promo por categoría que no es la del producto no cuenta", () => {
    const resultado = mejorDescuentoPorMetodo({
      precio: 20000,
      categoria: "PANTALONES",
      promociones: [
        EFECTIVO_10,
        promo({
          id: "cat",
          tipo_regla: "CATEGORIA",
          valor_descuento: 50,
          promociones_categorias: [{ categoria_nombre: "REMERAS" }],
        }),
      ],
      opcionesPago: OPCIONES,
    });

    expect(resultado?.precio).toBe(18000);
  });
});

describe("redondeo: la ficha, el desglose y el mensaje dicen lo mismo", () => {
  // El caso que pidió la consigna: un precio que no da redondo.
  const PRECIO = 17350;
  const PROMOS = [
    promo({
      tipo_regla: "METODO_PAGO",
      valor_descuento: 10,
      promociones_metodos_pago: [{ metodo_pago: "EFECTIVO" }],
    }),
  ];

  it("$17.350 con 10% da $15.615 en los tres lugares", () => {
    const enLaFicha = mejorDescuentoPorMetodo({
      precio: PRECIO,
      promociones: PROMOS,
      opcionesPago: [EFECTIVO],
    });

    const enElCarrito = calcularTotalesPedido({
      items: [item(PRECIO)],
      promociones: PROMOS,
      opcionPago: EFECTIVO,
    });

    const enWhatsApp = decodeURIComponent(
      generarLinkWhatsAppPublico({
        numeroWhatsApp: "5493491000000",
        nombreComercio: "Evens",
        items: [item(PRECIO)],
        totales: enElCarrito,
        etiquetaPago: "Efectivo",
        nombreCliente: "Mara",
        modalidad: "RETIRO",
      }),
    );

    expect(enLaFicha?.precio).toBe(15615);
    expect(enElCarrito.total).toBe(15615);
    expect(enElCarrito.descuento?.monto).toBe(1735);
    expect(enWhatsApp).toContain("TOTAL: $15.615");
    expect(enWhatsApp).toContain("Descuento efectivo: -$1.735");
  });

  it("redondea al peso y nunca deja centavos", () => {
    // 17.350 x 15% = 2.602,50
    const promos15 = [
      promo({
        tipo_regla: "METODO_PAGO",
        valor_descuento: 15,
        promociones_metodos_pago: [{ metodo_pago: "EFECTIVO" }],
      }),
    ];

    const enLaFicha = mejorDescuentoPorMetodo({
      precio: PRECIO,
      promociones: promos15,
      opcionesPago: [EFECTIVO],
    });
    const enElCarrito = calcularTotalesPedido({
      items: [item(PRECIO)],
      promociones: promos15,
      opcionPago: EFECTIVO,
    });

    expect(Number.isInteger(enLaFicha?.precio)).toBe(true);
    expect(Number.isInteger(enElCarrito.total)).toBe(true);
    expect(enLaFicha?.precio).toBe(enElCarrito.total);
    expect(enElCarrito.total).toBe(14747);
  });
});
