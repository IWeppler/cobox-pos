import { describe, expect, it } from "vitest";
import {
  ANTIGUEDAD_PARA_AVISAR_MS,
  antiguedadEnPalabras,
  hayQueAvisar,
} from "./antiguedad-dato";

const AHORA = new Date("2026-09-01T12:00:00Z").getTime();
const minutos = (n: number) => n * 60 * 1000;

describe("antiguedadEnPalabras", () => {
  it("abajo del minuto no pone número: al segundo no le importa a nadie", () => {
    expect(antiguedadEnPalabras(AHORA - 1000, AHORA)).toBe("recién");
    expect(antiguedadEnPalabras(AHORA - 59_000, AHORA)).toBe("recién");
  });

  it("redondea hacia abajo", () => {
    expect(antiguedadEnPalabras(AHORA - minutos(12) - 59_000, AHORA)).toBe(
      "hace 12 min",
    );
  });

  it("cambia de unidad en la hora y en el día", () => {
    expect(antiguedadEnPalabras(AHORA - minutos(59), AHORA)).toBe("hace 59 min");
    expect(antiguedadEnPalabras(AHORA - minutos(60), AHORA)).toBe("hace 1 hora");
    expect(antiguedadEnPalabras(AHORA - minutos(150), AHORA)).toBe("hace 2 horas");
    expect(antiguedadEnPalabras(AHORA - minutos(60 * 24), AHORA)).toBe("hace 1 día");
    expect(antiguedadEnPalabras(AHORA - minutos(60 * 24 * 3), AHORA)).toBe(
      "hace 3 días",
    );
  });

  it("un reloj adelantado no produce tiempos negativos", () => {
    expect(antiguedadEnPalabras(AHORA + minutos(5), AHORA)).toBe("recién");
  });
});

describe("hayQueAvisar", () => {
  it("sin dato no hay nada que avisar", () => {
    expect(hayQueAvisar(undefined, false, AHORA)).toBe(false);
  });

  it("sin conexión avisa SIEMPRE, aunque el dato sea de recién", () => {
    // Lo que importa ahí no es cuán viejo es, sino que no se está
    // actualizando: el precio puede cambiar y la pantalla no se va a enterar.
    expect(hayQueAvisar(AHORA - 1000, false, AHORA)).toBe(true);
  });

  it("con conexión calla mientras el dato sea reciente", () => {
    expect(hayQueAvisar(AHORA - minutos(3), true, AHORA)).toBe(false);
    expect(
      hayQueAvisar(AHORA - ANTIGUEDAD_PARA_AVISAR_MS + 1, true, AHORA),
    ).toBe(false);
    expect(hayQueAvisar(AHORA - ANTIGUEDAD_PARA_AVISAR_MS, true, AHORA)).toBe(
      true,
    );
  });
});
