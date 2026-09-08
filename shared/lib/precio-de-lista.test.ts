import { describe, expect, it } from "vitest";
import {
  admitePromociones,
  esPrecioVendible,
  precioBaseDeVariante,
  precioDeLista,
  type ListaDePrecios,
} from "./precio-de-lista";

const MAYORISTA: ListaDePrecios = {
  nombre: "Mayorista",
  tipo_regla: "PORCENTAJE",
  valor: -20,
  activa: true,
};

/**
 * Los casos A–I de la auditoría del 8/9/2026, tal como se escribieron ahí.
 * Están con el mismo nombre a propósito: si alguno cambia, la discusión que lo
 * decidió se puede volver a encontrar.
 */
describe("los casos de la auditoría", () => {
  it("A — sin lista, el precio de siempre", () => {
    const r = precioDeLista({ precioBase: 20000 });

    expect(r.precio).toBe(20000);
    expect(r.origen).toBe("base");
    expect(r.motivo).toBe("SIN_LISTA");
    expect(r.difiere).toBe(false);
  });

  it("B — lista mayorista de −20%", () => {
    const r = precioDeLista({ precioBase: 20000, lista: MAYORISTA });

    expect(r.precio).toBe(16000);
    expect(r.origen).toBe("regla");
    expect(r.precioBase).toBe(20000);
    expect(r.difiere).toBe(true);
  });

  it("C — el override reemplaza la regla, no se le suma", () => {
    // La campera con mayorista fijo: el −20% NO participa. Si el override se
    // aplicara sobre el resultado de la regla, esto daría 11.600.
    const r = precioDeLista({
      precioBase: 46000,
      lista: MAYORISTA,
      override: 37000,
    });

    expect(r.precio).toBe(37000);
    expect(r.origen).toBe("override");
  });

  it("E1 — producto sin override: manda la regla", () => {
    expect(
      precioDeLista({ precioBase: 20000, lista: MAYORISTA, override: null })
        .origen,
    ).toBe("regla");
  });

  it("E2 — producto con override: manda el override", () => {
    expect(
      precioDeLista({ precioBase: 20000, lista: MAYORISTA, override: 14500 })
        .precio,
    ).toBe(14500);
  });

  it("E3 — sin precio base no se vende, ni siquiera con lista", () => {
    // Un producto en $0 no es gratis: está sin cargar. Sin este freno, la
    // regla daría 0 y el POS cobraría $0 sin decir nada.
    const r = precioDeLista({ precioBase: 0, lista: MAYORISTA });

    expect(r.precio).toBe(0);
    expect(r.motivo).toBe("SIN_PRECIO_BASE");
    expect(esPrecioVendible(r)).toBe(false);
  });

  it("F — la lista opera sobre el precio de LA VARIANTE cuando lo tiene", () => {
    // 62 variantes de 5.904 tienen precio propio. La lista se aplica sobre ese
    // número, no sobre el del producto.
    const base = precioBaseDeVariante({ precio: 20000 }, { precio: 25000 });
    expect(base).toBe(25000);

    expect(precioDeLista({ precioBase: base, lista: MAYORISTA }).precio).toBe(
      20000,
    );
  });

  it("F bis — el override es del PRODUCTO y le gana al precio de la variante", () => {
    // Es la única celda donde el criterio puede sorprender, así que la
    // pantalla tiene que decirlo. Acá queda fijado el comportamiento.
    const base = precioBaseDeVariante({ precio: 20000 }, { precio: 25000 });
    const r = precioDeLista({ precioBase: base, lista: MAYORISTA, override: 14500 });

    expect(r.precio).toBe(14500);
    expect(r.origen).toBe("override");
    expect(r.precioBase).toBe(25000);
  });
});

describe("el precio base de una variante", () => {
  it("hereda del producto cuando la variante no tiene precio propio", () => {
    // El caso del 77,6% de las variantes.
    expect(precioBaseDeVariante({ precio: 12000 }, { precio: null })).toBe(12000);
    expect(precioBaseDeVariante({ precio: 12000 }, null)).toBe(12000);
    expect(precioBaseDeVariante({ precio: 12000 })).toBe(12000);
  });

  it("un precio de variante en CERO es un precio, no una ausencia", () => {
    // `?? ` sobre null, no sobre falsy: una variante cargada en 0 tiene que
    // caer en el freno de E3 y no heredar el precio del producto en silencio.
    expect(precioBaseDeVariante({ precio: 12000 }, { precio: 0 })).toBe(0);
  });
});

describe("la regla PORCENTAJE", () => {
  it("un valor positivo sube el precio", () => {
    // Firmado a propósito: la lista de contado y la de crédito son la misma
    // cosa mirada desde los dos lados.
    expect(
      precioDeLista({
        precioBase: 20000,
        lista: { tipo_regla: "PORCENTAJE", valor: 15 },
      }).precio,
    ).toBe(23000);
  });

  it("redondea al peso", () => {
    expect(
      precioDeLista({ precioBase: 19990, lista: MAYORISTA }).precio,
    ).toBe(15992);
  });

  it("un descuento del 100% o más no es un precio: cae a base", () => {
    for (const valor of [-100, -120]) {
      const r = precioDeLista({
        precioBase: 20000,
        lista: { tipo_regla: "PORCENTAJE", valor },
      });
      expect(r.precio).toBe(20000);
      expect(r.motivo).toBe("REGLA_INVALIDA");
    }
  });

  it("una lista de 0% no rompe: da el mismo precio y no difiere", () => {
    const r = precioDeLista({
      precioBase: 20000,
      lista: { tipo_regla: "PORCENTAJE", valor: 0 },
    });
    expect(r.precio).toBe(20000);
    expect(r.origen).toBe("regla");
    expect(r.difiere).toBe(false);
  });
});

describe("la regla MARKUP", () => {
  const POR_COSTO: ListaDePrecios = { tipo_regla: "MARKUP", valor: 1.5 };

  it("multiplica el costo, no el precio", () => {
    const r = precioDeLista({
      precioBase: 20000,
      precioCosto: 10000,
      lista: POR_COSTO,
    });

    expect(r.precio).toBe(15000);
    expect(r.origen).toBe("regla");
  });

  it("sin costo cargado cae al precio base y lo dice", () => {
    // 3.020 de 3.153 variantes de Evens tienen costo cero: es un caso
    // esperado, no una excepción. Sin este freno la lista vendería a $0.
    const r = precioDeLista({
      precioBase: 20000,
      precioCosto: 0,
      lista: POR_COSTO,
    });

    expect(r.precio).toBe(20000);
    expect(r.origen).toBe("base");
    expect(r.motivo).toBe("SIN_COSTO");
  });

  it("el costo ausente se trata igual que el costo cero", () => {
    expect(
      precioDeLista({ precioBase: 20000, lista: POR_COSTO }).motivo,
    ).toBe("SIN_COSTO");
  });
});

describe("fail-closed", () => {
  it("una regla desconocida NO inventa un precio", () => {
    // Mismo criterio que el `default` de `promocionAplica` y que los CHECK de
    // rubro, egresos.tipo y modo_facturacion.
    const r = precioDeLista({
      precioBase: 20000,
      lista: { tipo_regla: "ESCALA_POR_CANTIDAD", valor: 3 },
    });

    expect(r.precio).toBe(20000);
    expect(r.motivo).toBe("REGLA_DESCONOCIDA");
  });

  it("una lista apagada no se aplica aunque venga elegida", () => {
    const r = precioDeLista({
      precioBase: 20000,
      lista: { ...MAYORISTA, activa: false },
      override: 14500,
    });

    expect(r.precio).toBe(20000);
    expect(r.motivo).toBe("LISTA_INACTIVA");
  });

  it("un override negativo o cero se ignora y manda la regla", () => {
    for (const override of [0, -5000, NaN]) {
      expect(
        precioDeLista({ precioBase: 20000, lista: MAYORISTA, override }).precio,
      ).toBe(16000);
    }
  });

  it("valores basura no producen NaN", () => {
    const r = precioDeLista({
      precioBase: 20000,
      lista: { tipo_regla: "PORCENTAJE", valor: NaN },
    });
    expect(Number.isFinite(r.precio)).toBe(true);
    expect(r.precio).toBe(20000);
  });
});

describe("acumulación con promociones (caso D)", () => {
  it("sin lista, las promociones aplican como siempre", () => {
    expect(admitePromociones(null)).toBe(true);
    expect(admitePromociones(undefined)).toBe(true);
  });

  it("con lista, por defecto NO acumula", () => {
    // El default es la decisión: sobre $20.000 al doble del costo, −20% de
    // lista más 5% de promo dejan el margen en 34,2% contra 50%. Puede ser lo
    // que el comercio quiere, pero no puede pasar sin que nadie lo decida.
    expect(admitePromociones(MAYORISTA)).toBe(false);
    expect(admitePromociones({ ...MAYORISTA, admite_promociones: null })).toBe(
      false,
    );
  });

  it("acumula solo si la lista lo dice explícitamente", () => {
    expect(
      admitePromociones({ ...MAYORISTA, admite_promociones: true }),
    ).toBe(true);
  });

  it("el número del caso D, para que se vea lo que cuesta", () => {
    const precioLista = precioDeLista({
      precioBase: 20000,
      lista: { ...MAYORISTA, admite_promociones: true },
    }).precio;

    expect(precioLista).toBe(16000);
    // La promo del 5% la calcula descuento-promocion.ts sobre el ticket; acá
    // solo queda anotado a cuánto llega la suma de las dos.
    expect(Math.round(precioLista * 0.95)).toBe(15200);
  });
});
