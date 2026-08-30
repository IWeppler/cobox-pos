import { describe, expect, it } from "vitest";
import { RUBROS_VALIDOS } from "@/entities/config/types";
import { rubroUsaReservas } from "./reservas-por-rubro";

describe("rubroUsaReservas", () => {
  it("indumentaria reserva", () => {
    // Apartar ESE talle de ESE color es el caso que justifica la tabla: si se
    // vende, no vuelve hasta la próxima temporada.
    expect(rubroUsaReservas("indumentaria")).toBe(true);
  });

  it("ningún otro rubro reserva", () => {
    // Incluido electro, donde apartar es con seña —plata que entra— y eso hoy
    // se hace por cuenta corriente.
    for (const rubro of RUBROS_VALIDOS.filter((r) => r !== "indumentaria")) {
      expect(rubroUsaReservas(rubro)).toBe(false);
    }
  });

  it("sin rubro declarado, reserva", () => {
    // Cae en RUBRO_DEFAULT como el resto de la app. Acá el lado seguro es
    // mostrar: esconderlo en una tienda de ropa por una config que no llegó le
    // saca una función que usa todos los días.
    expect(rubroUsaReservas(undefined)).toBe(true);
  });
});
