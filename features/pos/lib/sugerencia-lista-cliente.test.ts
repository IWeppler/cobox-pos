import { describe, expect, it } from "vitest";
import {
  decidirSugerenciaDeLista,
  type EstadoSugerencia,
} from "./sugerencia-lista-cliente";

const MAYORISTA = "lista-mayorista";

const estado = (parcial: Partial<EstadoSugerencia> = {}): EstadoSugerencia => ({
  listaDelCliente: MAYORISTA,
  listaActivaId: null,
  listaExiste: true,
  elegidaAMano: false,
  ticketVacio: false,
  yaOfrecida: false,
  ...parcial,
});

describe("cuándo se aplica sola", () => {
  it("con el ticket vacío, porque no hay nada que cambiar de atrás para adelante", () => {
    expect(decidirSugerenciaDeLista(estado({ ticketVacio: true }))).toEqual({
      accion: "APLICAR",
      listaId: MAYORISTA,
    });
  });
});

describe("cuándo pregunta", () => {
  it("con renglones cargados, porque la clienta ya escuchó el total", () => {
    // El cliente se elige en el paso de PAGO: para cuando se sabe que es
    // mayorista, el ticket ya está armado.
    expect(decidirSugerenciaDeLista(estado())).toEqual({
      accion: "PREGUNTAR",
      listaId: MAYORISTA,
    });
  });
});

describe("cuándo no hace nada", () => {
  it("si la vendedora ya eligió la lista a mano", () => {
    // Su decisión gana. Insistir después de que la persona decidió es cómo se
    // enseña a cerrar los avisos sin leerlos.
    expect(
      decidirSugerenciaDeLista(estado({ elegidaAMano: true })).accion,
    ).toBe("NADA");
  });

  it("si el ticket ya está con esa misma lista", () => {
    expect(
      decidirSugerenciaDeLista(estado({ listaActivaId: MAYORISTA })).accion,
    ).toBe("NADA");
  });

  it("si ya se ofreció para este cliente y esta lista", () => {
    expect(decidirSugerenciaDeLista(estado({ yaOfrecida: true })).accion).toBe(
      "NADA",
    );
  });

  it("si la lista del cliente se apagó o se borró", () => {
    // Fail-closed, igual que `precioDeLista` con una lista inactiva.
    expect(decidirSugerenciaDeLista(estado({ listaExiste: false })).accion).toBe(
      "NADA",
    );
  });

  it("si el cliente no tiene lista asignada", () => {
    expect(
      decidirSugerenciaDeLista(estado({ listaDelCliente: null })).accion,
    ).toBe("NADA");
  });

  it("y un cliente SIN lista no devuelve el ticket a precio base", () => {
    // La regla que más fácil se escribe mal: ausencia de preferencia no es
    // preferencia por el precio base. Si la vendedora puso Mayorista a mano y
    // después elige un cliente cualquiera, el ticket NO se re-precia solo.
    expect(
      decidirSugerenciaDeLista(
        estado({ listaDelCliente: null, listaActivaId: MAYORISTA }),
      ),
    ).toEqual({ accion: "NADA" });
  });
});
