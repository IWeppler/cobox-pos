import { describe, expect, it } from "vitest";
import {
  anclaVencimientoFifo,
  estaVencidaFifo,
  imputarPagosFifo,
  vencimientoFifo,
  type MovimientoCC,
} from "./imputar-pagos-fifo";

const debito = (
  fecha: string,
  monto: number,
  extra: Partial<MovimientoCC> = {},
): MovimientoCC => ({ fecha, tipo: "DEBITO", monto, ...extra });

const credito = (
  fecha: string,
  monto: number,
  extra: Partial<MovimientoCC> = {},
): MovimientoCC => ({ fecha, tipo: "CREDITO", monto, ...extra });

/** Tres compras de 50.000, una por semana. Es la cuenta del enunciado. */
const TRES_DE_50 = [
  debito("2026-08-01", 50000),
  debito("2026-08-08", 50000),
  debito("2026-08-15", 50000),
];

describe("los casos del mostrador", () => {
  it("caso 1: paga 50.000 y salda la más vieja, entera", () => {
    const r = imputarPagosFifo([...TRES_DE_50, credito("2026-08-20", 50000)]);

    expect(r.deudas.map((d) => d.saldo)).toEqual([0, 50000, 50000]);
    expect(r.saldo).toBe(100000);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-08");
  });

  it("caso 2: paga 100.000 y salda las dos más viejas", () => {
    const r = imputarPagosFifo([...TRES_DE_50, credito("2026-08-20", 100000)]);

    expect(r.deudas.map((d) => d.saldo)).toEqual([0, 0, 50000]);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-15");
  });

  it("caso 3: paga 75.000 y salda la más vieja más la mitad de la segunda", () => {
    const r = imputarPagosFifo([...TRES_DE_50, credito("2026-08-20", 75000)]);

    expect(r.deudas.map((d) => d.saldo)).toEqual([0, 25000, 50000]);
    expect(r.deudas[1].pagado).toBe(25000);
    expect(r.saldo).toBe(75000);
    // Sigue siendo la del 08 la más vieja viva: pagada a medias es viva.
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-08");
  });

  it("caso 4: paga las tres justo y no queda nada", () => {
    const r = imputarPagosFifo([...TRES_DE_50, credito("2026-08-20", 150000)]);

    expect(r.saldo).toBe(0);
    expect(r.aFavor).toBe(0);
    expect(r.deudaVivaMasAntigua).toBeNull();
    expect(anclaVencimientoFifo([...TRES_DE_50, credito("2026-08-20", 150000)]))
      .toBeNull();
  });

  it("caso 5: paga de más y el sobrante queda a favor", () => {
    const r = imputarPagosFifo([...TRES_DE_50, credito("2026-08-20", 170000)]);

    expect(r.saldo).toBe(0);
    expect(r.aFavor).toBe(20000);
  });

  it("caso 6: el saldo a favor lo consume la compra siguiente", () => {
    const r = imputarPagosFifo([
      ...TRES_DE_50,
      credito("2026-08-20", 170000),
      debito("2026-08-25", 30000),
    ]);

    // 20.000 a favor contra una compra de 30.000: quedan 10.000 vivos.
    expect(r.saldo).toBe(10000);
    expect(r.aFavor).toBe(0);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-25");
  });

  it("caso 7: muchos pagos chicos suman y cancelan igual", () => {
    const r = imputarPagosFifo([
      ...TRES_DE_50,
      credito("2026-08-20", 20000),
      credito("2026-08-21", 20000),
      credito("2026-08-22", 20000),
    ]);

    // 60.000: cancela la primera y toca 10.000 de la segunda.
    expect(r.deudas.map((d) => d.saldo)).toEqual([0, 40000, 50000]);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-08");
  });

  it("caso 8: un pago que no alcanza ni para la más vieja la deja viva", () => {
    const r = imputarPagosFifo([...TRES_DE_50, credito("2026-08-20", 10000)]);

    expect(r.deudas[0].saldo).toBe(40000);
    expect(r.deudas[0].cancelada).toBe(false);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-01");
  });

  it("caso 9: comprar después de pagar no resucita lo ya cancelado", () => {
    const r = imputarPagosFifo([
      debito("2026-08-01", 50000),
      credito("2026-08-05", 50000),
      debito("2026-08-10", 30000),
    ]);

    expect(r.deudas[0].cancelada).toBe(true);
    expect(r.saldo).toBe(30000);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-10");
  });

  it("caso 10: sin ningún pago, la más vieja es la primera", () => {
    const r = imputarPagosFifo(TRES_DE_50);

    expect(r.saldo).toBe(150000);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-01");
  });
});

describe("orden y desempate", () => {
  it("caso 11: los movimientos desordenados dan el mismo resultado", () => {
    const desordenados = [
      credito("2026-08-20", 75000),
      debito("2026-08-15", 50000),
      debito("2026-08-01", 50000),
      debito("2026-08-08", 50000),
    ];

    expect(imputarPagosFifo(desordenados).deudas.map((d) => d.saldo)).toEqual([
      0, 25000, 50000,
    ]);
  });

  it("caso 12: pago y compra el MISMO día se ordenan por creadoEn", () => {
    // Es la cuenta de Angi Levis: el 05/09 el pago entró a las 14:17 y la
    // compra a las 21:01. Si se imputa al revés, el pago cae sobre la compra
    // nueva y la vieja queda viva.
    const r = imputarPagosFifo([
      debito("2026-08-17", 50000, { creadoEn: "2026-08-17T15:01:29Z" }),
      credito("2026-09-05", 40000, { creadoEn: "2026-09-05T14:17:42Z" }),
      debito("2026-09-05", 122000, { creadoEn: "2026-09-05T21:01:14Z" }),
    ]);

    expect(r.deudas[0].saldo).toBe(10000);
    expect(r.deudas[1].saldo).toBe(122000);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-17");
  });

  it("caso 13: sin creadoEn, el orden de entrada desempata y es estable", () => {
    const movimientos = [
      debito("2026-08-01", 10000),
      credito("2026-08-01", 10000),
      debito("2026-08-01", 5000),
    ];

    expect(imputarPagosFifo(movimientos).saldo).toBe(5000);
    expect(imputarPagosFifo(movimientos).saldo).toBe(5000);
  });
});

describe("bordes que no pueden romper la cuenta", () => {
  it("caso 14: una cuenta vacía no rompe ni inventa vencimiento", () => {
    const r = imputarPagosFifo([]);

    expect(r.saldo).toBe(0);
    expect(r.deudas).toEqual([]);
    expect(r.deudaVivaMasAntigua).toBeNull();
  });

  it("caso 15: un pago sin ninguna deuda queda todo a favor", () => {
    const r = imputarPagosFifo([credito("2026-08-01", 25000)]);

    expect(r.saldo).toBe(0);
    expect(r.aFavor).toBe(25000);
  });

  it("caso 16: los montos en cero se ignoran y no crean deudas fantasma", () => {
    const r = imputarPagosFifo([
      debito("2026-08-01", 0),
      debito("2026-08-02", 50000),
    ]);

    expect(r.deudas).toHaveLength(1);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-02");
  });

  it("caso 17: un monto negativo se trata como cero, no como el signo opuesto", () => {
    // Una fila corrupta no puede convertir un débito en un crédito.
    const r = imputarPagosFifo([
      debito("2026-08-01", 50000),
      debito("2026-08-02", -10000),
    ]);

    expect(r.saldo).toBe(50000);
    expect(r.deudas).toHaveLength(1);
  });

  it("caso 18: los centavos cierran y una deuda cancelada da 0 exacto", () => {
    const r = imputarPagosFifo([
      debito("2026-08-01", 33333.33),
      debito("2026-08-02", 33333.33),
      debito("2026-08-03", 33333.34),
      credito("2026-08-10", 100000),
    ]);

    expect(r.saldo).toBe(0);
    expect(r.deudas.every((d) => d.cancelada)).toBe(true);
  });

  it("caso 19: lo que hace mora a un débito es el flag, no la descripción", () => {
    // Un ajuste manual que diga "mora" en el texto es capital y tiene que
    // comportarse como capital: puede ser ancla. El flag sale de `pago_id`, no
    // de matchear el texto.
    const movimientos = [
      debito("2026-08-01", 50000),
      debito("2026-09-05", 5000, {
        descripcion: "Ajuste por mora acordada de palabra",
        creadoEn: "2026-09-05T17:59:00Z",
      }),
      credito("2026-09-05", 50000, { creadoEn: "2026-09-05T18:00:00Z" }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.deudas[0].cancelada).toBe(true);
    expect(r.saldo).toBe(5000);
    expect(r.moraViva).toBe(0);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-09-05");
  });

  it("caso 20: la cuenta real de Angi Levis deja viva la compra del 05/09", () => {
    const movimientos = [
      debito("2026-08-17", 50000, { creadoEn: "2026-08-17T15:01:29Z" }),
      credito("2026-09-05", 40000, { creadoEn: "2026-09-05T14:17:42Z" }),
      debito("2026-09-05", 122000, { creadoEn: "2026-09-05T21:01:14Z" }),
      credito("2026-09-07", 69500, { creadoEn: "2026-09-07T15:13:37Z" }),
    ];

    const r = imputarPagosFifo(movimientos);

    // El saldo tiene que dar igual a clientes.saldo_pendiente.
    expect(r.saldo).toBe(62500);
    expect(r.deudas[0].cancelada).toBe(true);
    expect(r.deudas[1].saldo).toBe(62500);
    // El ancla se corre del 17/08 al 05/09: con plazo 31 el vencimiento pasa
    // del 17/09 al 06/10.
    expect(anclaVencimientoFifo(movimientos)).toBe("2026-09-05");
  });
});

describe("la mora no se limpia sola", () => {
  const mora = (
    fecha: string,
    monto: number,
    extra: Partial<MovimientoCC> = {},
  ): MovimientoCC => ({
    fecha,
    tipo: "DEBITO",
    monto,
    esMora: true,
    descripcion: "Recargo por mora",
    ...extra,
  });

  it("caso 21: un pago parcial cancela capital y deja la mora viva", () => {
    // Es el freno que pidió la dueña. La mora es el débito más nuevo, así que
    // FIFO la cobra ÚLTIMA: es lo último que se limpia, no lo primero.
    const r = imputarPagosFifo([
      debito("2026-08-01", 50000),
      mora("2026-09-05", 5000, { creadoEn: "2026-09-05T17:59:00Z" }),
      credito("2026-09-05", 30000, { creadoEn: "2026-09-05T18:00:00Z" }),
    ]);

    expect(r.moraViva).toBe(5000);
    expect(r.deudas[0].saldo).toBe(20000);
  });

  it("caso 22: con capital saldado y mora viva, la cuenta SIGUE vencida", () => {
    // El agujero que hay que tapar: sin esto el ancla saltaba a la fecha de la
    // propia mora —que es de hoy, porque se cobra el día del pago— y la
    // clienta arrancaba un plazo nuevo entero debiendo el recargo.
    const movimientos = [
      debito("2026-08-01", 50000),
      mora("2026-09-05", 5000, { creadoEn: "2026-09-05T17:59:00Z" }),
      credito("2026-09-05", 50000, { creadoEn: "2026-09-05T18:00:00Z" }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.saldo).toBe(5000);
    expect(r.moraViva).toBe(5000);
    // No hay ancla de capital: la mora no puede ser el ancla.
    expect(r.deudaVivaMasAntigua).toBeNull();
    expect(anclaVencimientoFifo(movimientos)).toBeNull();
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(true);
  });

  it("caso 23: pagando TODO, mora incluida, la cuenta queda al día", () => {
    const movimientos = [
      debito("2026-08-01", 50000),
      mora("2026-09-05", 5000, { creadoEn: "2026-09-05T17:59:00Z" }),
      credito("2026-09-05", 55000, { creadoEn: "2026-09-05T18:00:00Z" }),
    ];

    expect(imputarPagosFifo(movimientos).moraViva).toBe(0);
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(false);
  });

  it("caso 24: una compra nueva no tapa la mora vieja", () => {
    // Capital al día (compró hoy) pero con recargo impago: vencida igual.
    const movimientos = [
      debito("2026-08-01", 50000),
      mora("2026-09-05", 5000, { creadoEn: "2026-09-05T17:59:00Z" }),
      credito("2026-09-05", 50000, { creadoEn: "2026-09-05T18:00:00Z" }),
      debito("2026-09-08", 20000),
    ];

    expect(anclaVencimientoFifo(movimientos)).toBe("2026-09-08");
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(true);
  });

  it("caso 25: la cuenta real de Vero duarte sigue vencida", () => {
    // Con la regla del ciclo vencía el 30/08; con FIFO puro, el 08/09. Las dos
    // la dan vencida hoy, y además le queda mora viva de 1.500.
    const movimientos = [
      debito("2026-07-24", 6000),
      credito("2026-07-30", 6000, { creadoEn: "2026-07-30T10:00:00Z" }),
      debito("2026-07-30", 29000, { creadoEn: "2026-07-30T11:00:00Z" }),
      debito("2026-08-01", 16000),
      credito("2026-08-08", 30000, { creadoEn: "2026-08-08T10:00:00Z" }),
      debito("2026-08-08", 30000, { creadoEn: "2026-08-08T11:00:00Z" }),
      debito("2026-08-22", 17000),
      mora("2026-09-05", 1500, { creadoEn: "2026-09-05T17:59:00Z" }),
      credito("2026-09-05", 32000, { creadoEn: "2026-09-05T18:00:00Z" }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.saldo).toBe(31500);
    expect(r.moraViva).toBe(1500);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-08");
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(true);
  });

  it("caso 26: Angi Levis queda al día, sin mora, con ancla en el 05/09", () => {
    const movimientos = [
      debito("2026-08-17", 50000, { creadoEn: "2026-08-17T15:01:29Z" }),
      credito("2026-09-05", 40000, { creadoEn: "2026-09-05T14:17:42Z" }),
      debito("2026-09-05", 122000, { creadoEn: "2026-09-05T21:01:14Z" }),
      credito("2026-09-07", 69500, { creadoEn: "2026-09-07T15:13:37Z" }),
    ];

    expect(imputarPagosFifo(movimientos).moraViva).toBe(0);
    expect(anclaVencimientoFifo(movimientos)).toBe("2026-09-05");
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(false);
    // 05/09 + 31 = 06/10: recién al día siguiente está vencida.
    expect(estaVencidaFifo(movimientos, 31, "2026-10-06")).toBe(false);
    expect(estaVencidaFifo(movimientos, 31, "2026-10-07")).toBe(true);
  });
});

describe("vencimientoFifo — espejo de recalcular_vencimiento_cc", () => {
  const mora = (
    fecha: string,
    monto: number,
    extra: Partial<MovimientoCC> = {},
  ): MovimientoCC => ({ fecha, tipo: "DEBITO", monto, esMora: true, ...extra });

  it("caso 27: Angi Levis vence el 06/10, no el 17/09", () => {
    expect(
      vencimientoFifo(
        [
          debito("2026-08-17", 50000, { creadoEn: "2026-08-17T15:01:29Z" }),
          credito("2026-09-05", 40000, { creadoEn: "2026-09-05T14:17:42Z" }),
          debito("2026-09-05", 122000, { creadoEn: "2026-09-05T21:01:14Z" }),
          credito("2026-09-07", 69500, { creadoEn: "2026-09-07T15:13:37Z" }),
        ],
        31,
      ),
    ).toBe("2026-10-06");
  });

  it("caso 28: sin deuda no hay vencimiento", () => {
    expect(vencimientoFifo([], 31)).toBeNull();
    expect(
      vencimientoFifo(
        [debito("2026-08-01", 50000), credito("2026-08-05", 50000)],
        31,
      ),
    ).toBeNull();
  });

  it("caso 29: con solo mora viva, la fecha es la de la mora, sin plazo nuevo", () => {
    expect(
      vencimientoFifo(
        [
          debito("2026-08-01", 50000),
          mora("2026-09-05", 5000, { creadoEn: "2026-09-05T17:59:00Z" }),
          credito("2026-09-05", 50000, { creadoEn: "2026-09-05T18:00:00Z" }),
        ],
        31,
      ),
    ).toBe("2026-09-05");
  });

  it("caso 30: con capital y mora vivos gana la más exigente", () => {
    // Capital del 08/09 (+31 = 09/10) contra mora del 05/09: gana la mora.
    expect(
      vencimientoFifo(
        [
          debito("2026-08-01", 50000),
          mora("2026-09-05", 5000, { creadoEn: "2026-09-05T17:59:00Z" }),
          credito("2026-09-05", 50000, { creadoEn: "2026-09-05T18:00:00Z" }),
          debito("2026-09-08", 20000),
        ],
        31,
      ),
    ).toBe("2026-09-05");
  });

  it("caso 31: Vero duarte — la mora de 1.500 manda sobre el capital", () => {
    expect(
      vencimientoFifo(
        [
          debito("2026-07-24", 6000),
          credito("2026-07-30", 6000, { creadoEn: "2026-07-30T10:00:00Z" }),
          debito("2026-07-30", 29000, { creadoEn: "2026-07-30T11:00:00Z" }),
          debito("2026-08-01", 16000),
          credito("2026-08-08", 30000, { creadoEn: "2026-08-08T10:00:00Z" }),
          debito("2026-08-08", 30000, { creadoEn: "2026-08-08T11:00:00Z" }),
          debito("2026-08-22", 17000),
          mora("2026-09-05", 1500, { creadoEn: "2026-09-05T17:59:00Z" }),
          credito("2026-09-05", 32000, { creadoEn: "2026-09-05T18:00:00Z" }),
        ],
        31,
      ),
      // Capital 08/08 + 31 = 08/09; mora 05/09. Gana la mora.
    ).toBe("2026-09-05");
  });
});

describe("un pago parcial no limpia la mora ni corre la fecha", () => {
  const mora = (
    fecha: string,
    monto: number,
    extra: Partial<MovimientoCC> = {},
  ): MovimientoCC => ({ fecha, tipo: "DEBITO", monto, esMora: true, ...extra });

  /** El ejemplo del enunciado: compra de 10.000 el 01/08, recargo de 3.000 el
   * 04/09 por los 34 días. La cuenta debe 13.000. */
  const TICKET_CON_MORA = [
    debito("2026-08-01", 10000, { id: "compra-agosto" }),
    mora("2026-09-04", 3000, {
      creadoEn: "2026-09-04T17:59:00Z",
      debitoOrigenId: "compra-agosto",
    }),
  ];

  const pagando = (monto: number) => [
    ...TICKET_CON_MORA,
    credito("2026-09-04", monto, { creadoEn: "2026-09-04T18:00:00Z" }),
  ];

  it("caso 32: paga 5.000 de 13.000 — quedan 8.000 y sigue en mora", () => {
    const r = imputarPagosFifo(pagando(5000));

    expect(r.saldo).toBe(8000);
    // El recargo es lo último que se paga DENTRO del ticket, así que sigue
    // entero mientras quede capital.
    expect(r.moraViva).toBe(3000);
    expect(estaVencidaFifo(pagando(5000), 31, "2026-09-09")).toBe(true);
    // Y la fecha no se corre: es la misma deuda, la del 01/08.
    expect(vencimientoFifo(pagando(5000), 31)).toBe("2026-09-01");
  });

  it("caso 33: paga los 10.000 del capital — los 3.000 de mora la dejan vencida", () => {
    const r = imputarPagosFifo(pagando(10000));

    expect(r.saldo).toBe(3000);
    expect(r.moraViva).toBe(3000);
    expect(estaVencidaFifo(pagando(10000), 31, "2026-09-09")).toBe(true);
  });

  it("caso 34: recién con los 13.000 completos queda al día", () => {
    const r = imputarPagosFifo(pagando(13000));

    expect(r.saldo).toBe(0);
    expect(r.moraViva).toBe(0);
    expect(estaVencidaFifo(pagando(13000), 31, "2026-09-09")).toBe(false);
    expect(vencimientoFifo(pagando(13000), 31)).toBeNull();
  });
});

describe("capital y mora del mismo ticket son una sola deuda", () => {
  const mora = (
    fecha: string,
    monto: number,
    extra: Partial<MovimientoCC> = {},
  ): MovimientoCC => ({ fecha, tipo: "DEBITO", monto, esMora: true, ...extra });

  /** El caso del enunciado: $13.000 de agosto ($10.000 + $3.000 de recargo) y
   * $20.000 de septiembre. */
  const DOS_TICKETS = [
    debito("2026-08-01", 10000, { id: "agosto" }),
    mora("2026-09-04", 3000, {
      creadoEn: "2026-09-04T17:59:00Z",
      debitoOrigenId: "agosto",
    }),
    debito("2026-09-06", 20000, { id: "septiembre" }),
  ];

  it("caso 35: trae 13.000 y salda agosto entero, recargo incluido", () => {
    const movimientos = [
      ...DOS_TICKETS,
      credito("2026-09-08", 13000, { creadoEn: "2026-09-08T12:00:00Z" }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.deudas[0].cancelada).toBe(true);
    expect(r.moraViva).toBe(0);
    expect(r.saldo).toBe(20000);
    // El vencimiento pasa a ser el de la compra de septiembre.
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-09-06");
    expect(vencimientoFifo(movimientos, 31)).toBe("2026-10-07");
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(false);
  });

  it("caso 36: un peso menos y agosto sigue vivo, con su fecha", () => {
    // La diferencia entre las dos lecturas está acá: si el recargo fuera una
    // deuda suelta al final de la cola, 12.999 habrían saldado el capital de
    // agosto y movido el ancla. Como es una unidad, no.
    const movimientos = [
      ...DOS_TICKETS,
      credito("2026-09-08", 12999, { creadoEn: "2026-09-08T12:00:00Z" }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.deudas[0].saldo).toBe(1);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-01");
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(true);
  });

  it("caso 37: el recargo revive el ticket que ya estaba pagado", () => {
    // Se paga el capital, y DESPUÉS entra el recargo de esa misma compra. La
    // deuda vuelve a estar viva y con su fecha vieja: no está saldada hasta
    // que se pague también el recargo.
    const movimientos = [
      debito("2026-08-01", 10000, { id: "agosto" }),
      credito("2026-09-04", 10000, { creadoEn: "2026-09-04T17:00:00Z" }),
      mora("2026-09-04", 3000, {
        creadoEn: "2026-09-04T17:59:00Z",
        debitoOrigenId: "agosto",
      }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.saldo).toBe(3000);
    expect(r.deudas).toHaveLength(1);
    expect(r.deudaVivaMasAntigua?.fecha).toBe("2026-08-01");
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(true);
  });

  it("caso 38: un recargo sin ticket conocido mantiene la cuenta vencida", () => {
    // `debito_origen_id` en null. Hoy no hay ninguno, pero si aparece no puede
    // arrancar un plazo nuevo con la fecha del día en que se cobró.
    const movimientos = [
      debito("2026-08-01", 10000, { id: "agosto" }),
      mora("2026-09-04", 3000, { creadoEn: "2026-09-04T17:59:00Z" }),
      credito("2026-09-04", 10000, { creadoEn: "2026-09-04T18:00:00Z" }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.moraHuerfanaViva).toBe(3000);
    expect(r.deudaVivaMasAntigua).toBeNull();
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(true);
  });

  it("caso 39: un recargo que apunta a un ticket ausente no se adivina", () => {
    // El vínculo existe pero el ticket no está en los movimientos recibidos:
    // se trata como suelto, nunca se lo cuelga del primero que haya.
    const r = imputarPagosFifo([
      debito("2026-08-01", 10000, { id: "agosto" }),
      mora("2026-09-04", 3000, {
        creadoEn: "2026-09-04T17:59:00Z",
        debitoOrigenId: "un-ticket-que-no-vino",
      }),
    ]);

    expect(r.deudas).toHaveLength(2);
    expect(r.deudas[0].montoMora).toBe(0);
    expect(r.moraHuerfanaViva).toBe(3000);
  });

  it("caso 40: Vero duarte sigue vencida con el vínculo real", () => {
    // Su recargo de 1.500 quedó atribuido al ticket del 01/08 de 16.000.
    const movimientos = [
      debito("2026-07-24", 6000),
      credito("2026-07-30", 6000, { creadoEn: "2026-07-30T10:00:00Z" }),
      debito("2026-07-30", 29000, { creadoEn: "2026-07-30T11:00:00Z" }),
      debito("2026-08-01", 16000, { id: "ticket-agosto" }),
      credito("2026-08-08", 30000, { creadoEn: "2026-08-08T10:00:00Z" }),
      debito("2026-08-08", 30000, { creadoEn: "2026-08-08T11:00:00Z" }),
      debito("2026-08-22", 17000),
      mora("2026-09-05", 1500, {
        creadoEn: "2026-09-05T17:59:00Z",
        debitoOrigenId: "ticket-agosto",
      }),
      credito("2026-09-05", 32000, { creadoEn: "2026-09-05T18:00:00Z" }),
    ];
    const r = imputarPagosFifo(movimientos);

    expect(r.saldo).toBe(31500);
    expect(estaVencidaFifo(movimientos, 31, "2026-09-09")).toBe(true);
  });

  it("caso 41: el saldo cierra igual, pero el ancla no", () => {
    // Paga 12.000 sobre un ticket de 13.000 (10.000 + 3.000 de recargo).
    //
    // CON vínculo: falta 1 peso de la unidad de agosto, así que agosto sigue
    // viva y el vencimiento sigue siendo el suyo.
    // SIN vínculo: los 10.000 saldan la compra y los 2.000 restantes van al
    // recargo suelto; como un recargo no puede ser ancla, el vencimiento salta
    // a la compra de septiembre. La clienta pasa de vencida a al día por no
    // saber de qué deuda era el recargo.
    //
    // Lo que NO cambia es cuánto debe: es la misma resta.
    const conVinculo = imputarPagosFifo([
      ...DOS_TICKETS,
      credito("2026-09-08", 12000),
    ]);
    const sinVinculo = imputarPagosFifo([
      debito("2026-08-01", 10000, { id: "agosto" }),
      mora("2026-09-04", 3000, { creadoEn: "2026-09-04T17:59:00Z" }),
      debito("2026-09-06", 20000, { id: "septiembre" }),
      credito("2026-09-08", 12000),
    ]);

    expect(conVinculo.saldo).toBe(21000);
    expect(sinVinculo.saldo).toBe(21000);

    expect(conVinculo.deudaVivaMasAntigua?.fecha).toBe("2026-08-01");
    expect(sinVinculo.deudaVivaMasAntigua?.fecha).toBe("2026-09-06");
  });
});
