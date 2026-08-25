import { describe, it, expect } from "vitest";
import { validarPerdonDeuda } from "./validar-perdon-deuda";

const MOTIVO = "Se le perdona el recargo por mora";

describe("validarPerdonDeuda", () => {
  it("el caso real: perdonar todo el saldo deja la cuenta en cero", () => {
    // Brisa Suárez: $7.557,50 que eran el resto del recargo por mora.
    const r = validarPerdonDeuda({ monto: 7557.5, motivo: MOTIVO }, 7557.5);
    expect(r).toEqual({
      ok: true,
      monto: 7557.5,
      motivo: MOTIVO,
      saldoFinal: 0,
    });
  });

  it("perdonar una parte deja el resto de la deuda viva", () => {
    const r = validarPerdonDeuda({ monto: 3000, motivo: MOTIVO }, 7557.5);
    expect(r.ok && r.saldoFinal).toBe(4557.5);
  });

  it("no se puede perdonar más de lo que debe", () => {
    // Dejaría el saldo en negativo: el comercio debiéndole plata a la clienta.
    const r = validarPerdonDeuda({ monto: 10000, motivo: MOTIVO }, 7557.5);
    expect(r).toEqual({
      ok: false,
      error: "No se puede perdonar más de lo que el cliente debe.",
    });
  });

  it("tolera centavos para que 'perdonar todo' no rebote", () => {
    expect(validarPerdonDeuda({ monto: 7558, motivo: MOTIVO }, 7557.5).ok).toBe(
      true,
    );
  });

  it("sin deuda no hay nada que perdonar", () => {
    const r = validarPerdonDeuda({ monto: 100, motivo: MOTIVO }, 0);
    expect(r.ok).toBe(false);
  });

  it("el monto tiene que ser positivo", () => {
    expect(validarPerdonDeuda({ monto: 0, motivo: MOTIVO }, 5000).ok).toBe(false);
    expect(validarPerdonDeuda({ monto: -100, motivo: MOTIVO }, 5000).ok).toBe(
      false,
    );
    expect(validarPerdonDeuda({ monto: NaN, motivo: MOTIVO }, 5000).ok).toBe(
      false,
    );
  });

  it("el motivo es obligatorio: es lo que separa un perdón de un error", () => {
    expect(validarPerdonDeuda({ monto: 100, motivo: "" }, 5000).ok).toBe(false);
    expect(validarPerdonDeuda({ monto: 100, motivo: "  " }, 5000).ok).toBe(
      false,
    );
  });

  it("recorta el motivo antes de guardarlo", () => {
    const r = validarPerdonDeuda({ monto: 100, motivo: "  mora  " }, 5000);
    expect(r.ok && r.motivo).toBe("mora");
  });
});
