import { describe, expect, it } from "vitest";
import {
  calcularScoringCliente,
  reconstruirEpisodios,
  type DatosScoring,
  type MovimientoCuenta,
} from "./scoring-cliente";

const HOY = new Date("2026-08-15T12:00:00Z");
const REFERENCIA = { margenMaximo: 100_000, comprasMaximas: 20 };

function datos(over: Partial<DatosScoring> = {}): DatosScoring {
  return {
    movimientos: [],
    ventas: [],
    saldoActual: 0,
    fechaVencimientoDeuda: null,
    limiteCredito: null,
    clienteDesde: "2025-01-01",
    tuvoRecargoMora: false,
    ...over,
  };
}

function score(over: Partial<DatosScoring> = {}) {
  return calcularScoringCliente(datos(over), HOY, REFERENCIA);
}

/** Un ciclo de deuda: se le fía y paga. */
function episodio(inicio: string, cierre: string, monto = 10_000): MovimientoCuenta[] {
  return [
    { tipo: "DEBITO", monto, fecha: inicio },
    { tipo: "CREDITO", monto, fecha: cierre },
  ];
}

describe("reconstruirEpisodios", () => {
  it("un ciclo de deuda es un episodio con su duración", () => {
    const [ep] = reconstruirEpisodios(episodio("2026-01-01", "2026-01-20"), HOY);
    expect(ep.duracionDias).toBe(19);
  });

  it("varios pagos parciales cierran UN episodio, no varios", () => {
    const eps = reconstruirEpisodios(
      [
        { tipo: "DEBITO", monto: 10_000, fecha: "2026-01-01" },
        { tipo: "CREDITO", monto: 4_000, fecha: "2026-01-10" },
        { tipo: "CREDITO", monto: 6_000, fecha: "2026-01-25" },
      ],
      HOY,
    );
    expect(eps).toHaveLength(1);
    expect(eps[0].duracionDias).toBe(24);
  });

  it("los movimientos anulados no cuentan", () => {
    const eps = reconstruirEpisodios(
      [
        { tipo: "DEBITO", monto: 10_000, fecha: "2026-01-01" },
        { tipo: "DEBITO", monto: 99_000, fecha: "2026-01-02", anulado: true },
        { tipo: "CREDITO", monto: 10_000, fecha: "2026-01-10" },
      ],
      HOY,
    );
    expect(eps[0].cierre).toBe("2026-01-10");
  });

  it("un resto de centavos no deja el episodio abierto", () => {
    const [ep] = reconstruirEpisodios(
      [
        { tipo: "DEBITO", monto: 10_000, fecha: "2026-01-01" },
        { tipo: "CREDITO", monto: 9_999.6, fecha: "2026-01-10" },
      ],
      HOY,
    );
    expect(ep.cierre).toBe("2026-01-10");
  });
});

describe("calcularScoringCliente — el que no debe nada está en 100", () => {
  it("una sola venta pagada de contado da 100", () => {
    // No debe nada y nunca se atrasó: no hay razón para puntuarlo por debajo
    // del ideal. Haber comprado poco es poca información, no un defecto.
    const s = score({ ventas: [{ fecha: "2026-08-10", total: 5_000 }] });

    expect(s.puntaje).toBe(100);
    expect(s.factores[0]).toContain("contado");
  });

  it("una cuenta corriente pagada en término da 100", () => {
    const s = score({
      movimientos: episodio("2026-07-01", "2026-07-20"),
      ventas: [{ fecha: "2026-07-01", total: 10_000 }],
    });

    expect(s.puntaje).toBe(100);
    expect(s.episodios).toBe(1);
  });

  it("muchas cuentas pagadas en término siguen dando 100", () => {
    const s = score({
      movimientos: [
        ...episodio("2026-01-01", "2026-01-20"),
        ...episodio("2026-03-01", "2026-03-15"),
        ...episodio("2026-05-01", "2026-05-18"),
      ],
    });

    expect(s.puntaje).toBe(100);
    expect(s.rachaEnTermino).toBe(3);
    expect(s.factores[0]).toContain("3 pagos seguidos");
  });

  it("un cliente sin compras también está en 100, pero se dice por qué", () => {
    // No hay nada que reprocharle. El texto evita leer el 100 como mérito.
    const s = score();
    expect(s.puntaje).toBe(100);
    expect(s.factores[0]).toContain("Todavía no compró");
  });
});

describe("calcularScoringCliente — el que debe y nunca pagó", () => {
  /** Caso real de Evens: $70.100 desde hace 153 días, un cargo y cero pagos. */
  const MIRTA = {
    movimientos: [
      { tipo: "DEBITO" as const, monto: 70_100, fecha: "2026-02-12" },
    ],
    saldoActual: 70_100,
    fechaVencimientoDeuda: "2026-03-14",
    ventas: [{ fecha: "2026-02-12", total: 70_100 }],
  };

  it("deber hace 5 meses sin haber pagado nunca es el peor caso", () => {
    // El bug que este test fija: mirando solo episodios CERRADOS, este cliente
    // no tenía ninguno, así que "se atrasó 0 de 0 veces" no castigaba y
    // llegaba a 80 puntos — mejor que alguien que pagó tarde pero pagó.
    const s = score(MIRTA);

    expect(s.puntaje).toBeLessThan(20);
    expect(s.nivel).toBe("riesgoso");
    expect(s.factores.join(" ")).toContain("Todavía no pagó");
  });

  it("puntúa peor que alguien que se atrasó pero pagó", () => {
    const pagoTarde = score({
      movimientos: [
        ...episodio("2026-02-12", "2026-05-20", 70_100),
        ...episodio("2026-06-01", "2026-07-25", 30_000),
      ],
    });

    expect(score(MIRTA).puntaje).toBeLessThan(pagoTarde.puntaje);
  });

  it("cuanto más vieja la deuda, más baja — no topea a los 90 días", () => {
    // Antes, deber hace 3 meses y deber hace un año costaban lo mismo.
    const tresMeses = score({ ...MIRTA, fechaVencimientoDeuda: "2026-05-10" });
    const unAnio = score({ ...MIRTA, fechaVencimientoDeuda: "2025-08-10" });

    expect(unAnio.puntaje).toBeLessThan(tresMeses.puntaje);
  });

  it("una deuda DENTRO del plazo no se castiga como atraso", () => {
    // Deber no es malo: deber tarde sí.
    const alDia = score({
      movimientos: [
        { tipo: "DEBITO" as const, monto: 10_000, fecha: "2026-08-05" },
      ],
      saldoActual: 10_000,
      fechaVencimientoDeuda: "2026-09-04",
      ventas: [{ fecha: "2026-08-05", total: 10_000 }],
    });

    expect(alDia.puntaje).toBe(100);
  });

  it("ni el mejor cliente se salva de una mora de 5 meses", () => {
    const elMejor = score({
      ...MIRTA,
      ventas: Array.from({ length: 40 }, () => ({
        fecha: "2026-08-14",
        total: 80_000,
        costo: 5_000,
      })),
    });

    expect(elMejor.nivel).toBe("riesgoso");
  });
});

describe("calcularScoringCliente — lo que baja el puntaje", () => {
  it("atrasarse siempre lo hunde", () => {
    const s = score({
      movimientos: [
        ...episodio("2026-01-01", "2026-04-01"),
        ...episodio("2026-04-05", "2026-07-01"),
      ],
    });

    expect(s.puntaje).toBeLessThan(50);
    expect(s.factores.join(" ")).toContain("fuera de término");
  });

  it("un atraso viejo pesa menos que uno reciente", () => {
    const viejo = score({
      movimientos: [
        ...episodio("2024-01-01", "2024-04-01"),
        ...episodio("2026-06-01", "2026-06-20"),
      ],
    });
    const reciente = score({
      movimientos: [
        ...episodio("2026-04-01", "2026-07-01"),
        ...episodio("2026-07-05", "2026-07-20"),
      ],
    });

    expect(viejo.puntaje).toBeGreaterThan(reciente.puntaje);
  });

  it("la deuda vencida de hoy descuenta según su antigüedad", () => {
    const base = {
      movimientos: [{ tipo: "DEBITO" as const, monto: 5_000, fecha: "2026-03-01" }],
      saldoActual: 5_000,
    };

    const reciente = score({ ...base, fechaVencimientoDeuda: "2026-08-05" });
    const antigua = score({ ...base, fechaVencimientoDeuda: "2026-03-31" });

    expect(antigua.puntaje).toBeLessThan(reciente.puntaje);
    expect(antigua.factores.join(" ")).toContain("Debe hace");
  });

  it("estar sobreexpuesto en tickets descuenta", () => {
    const base = {
      ventas: [
        { fecha: "2026-01-01", total: 1_000 },
        { fecha: "2026-02-01", total: 1_000 },
      ],
    };

    const normal = score({ ...base, saldoActual: 2_000 });
    const expuesto = score({ ...base, saldoActual: 20_000 });

    expect(expuesto.puntaje).toBeLessThan(normal.puntaje);
    expect(expuesto.factores.join(" ")).toContain("compras suyas");
  });

  it("nunca se sale de 1..100", () => {
    const pesimo = score({
      movimientos: [
        ...episodio("2026-01-01", "2026-07-01"),
        ...episodio("2026-07-02", "2026-08-01"),
      ],
      saldoActual: 500_000,
      fechaVencimientoDeuda: "2026-01-01",
      limiteCredito: 10_000,
      ventas: [{ fecha: "2026-01-01", total: 1_000 }],
      tuvoRecargoMora: true,
    });

    expect(pesimo.puntaje).toBeGreaterThanOrEqual(1);
    expect(pesimo.puntaje).toBeLessThanOrEqual(100);
  });
});

describe("calcularScoringCliente — el valor amortigua, no compite", () => {
  const malComportamiento = {
    movimientos: [
      ...episodio("2026-04-01", "2026-07-01"),
      ...episodio("2026-07-05", "2026-08-10"),
    ],
  };

  it("el mismo atraso duele menos si el cliente deja mucho margen", () => {
    // Es la decisión comercial real —"le fío igual porque es mi mejor
    // cliente"— puesta en el número.
    const chico = score({
      ...malComportamiento,
      ventas: [{ fecha: "2026-08-10", total: 2_000, costo: 1_800 }],
    });
    const valioso = score({
      ...malComportamiento,
      ventas: Array.from({ length: 20 }, (_, i) => ({
        fecha: `2026-08-${String(i + 1).padStart(2, "0")}`,
        total: 20_000,
        costo: 5_000,
      })),
    });

    expect(valioso.puntaje).toBeGreaterThan(chico.puntaje);
    expect(valioso.amortiguacion).toBeGreaterThan(chico.amortiguacion);
    expect(valioso.factores.join(" ")).toContain("Compensa");
  });

  it("el valor NUNCA baja el puntaje por sí solo", () => {
    // Si restara, el cliente chico y cumplidor terminaría peor puntuado que el
    // grande y moroso, que es al revés de lo que hay que decidir.
    const chicoCumplidor = score({
      movimientos: episodio("2026-07-01", "2026-07-20"),
      ventas: [{ fecha: "2026-07-01", total: 500, costo: 450 }],
    });

    expect(chicoCumplidor.puntaje).toBe(100);
    expect(chicoCumplidor.amortiguacion).toBe(0);
  });

  it("un cliente valioso pero inactivo amortigua menos", () => {
    // Ya no es alguien a quien convenga cuidar con más crédito.
    const activo = score({
      ...malComportamiento,
      ventas: Array.from({ length: 20 }, () => ({
        fecha: "2026-08-01",
        total: 20_000,
        costo: 5_000,
      })),
    });
    const dormido = score({
      ...malComportamiento,
      ventas: Array.from({ length: 20 }, () => ({
        fecha: "2025-06-01",
        total: 20_000,
        costo: 5_000,
      })),
    });

    expect(dormido.amortiguacion).toBeLessThan(activo.amortiguacion);
    expect(dormido.puntaje).toBeLessThan(activo.puntaje);
  });

  it("la amortiguación nunca borra el atraso", () => {
    // Ser valioso explica darle otra oportunidad, no que el atraso no exista.
    const elMejor = score({
      ...malComportamiento,
      ventas: Array.from({ length: 50 }, () => ({
        fecha: "2026-08-14",
        total: 100_000,
        costo: 1_000,
      })),
    });

    expect(elMejor.puntaje).toBeLessThan(100);
    expect(elMejor.amortiguacion).toBeLessThanOrEqual(0.3);
  });
});
