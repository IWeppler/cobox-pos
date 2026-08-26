import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_VERIFICAR,
  estadoVerificacionEmail,
} from "./verificacion-email";

const AHORA = new Date("2026-08-26T12:00:00Z");

describe("estadoVerificacionEmail", () => {
  it("quien verificó no ve ningún aviso", () => {
    expect(
      estadoVerificacionEmail({
        emailConfirmado: true,
        creadoEn: "2026-01-01T00:00:00Z",
        ahora: AHORA,
      }),
    ).toEqual({ estado: "verificado" });
  });

  it("recién registrado: aviso suave con el plazo completo", () => {
    expect(
      estadoVerificacionEmail({
        emailConfirmado: false,
        creadoEn: "2026-08-26T09:00:00Z",
        ahora: AHORA,
      }),
    ).toEqual({ estado: "pendiente", diasRestantes: 7 });
  });

  it("descuenta los días transcurridos", () => {
    expect(
      estadoVerificacionEmail({
        emailConfirmado: false,
        creadoEn: "2026-08-21T12:00:00Z",
        ahora: AHORA,
      }),
    ).toEqual({ estado: "pendiente", diasRestantes: 2 });
  });

  it("el día 7 ya está vencido", () => {
    // El plazo es de 7 días completos: al séptimo se terminó, no queda uno más.
    expect(
      estadoVerificacionEmail({
        emailConfirmado: false,
        creadoEn: "2026-08-19T12:00:00Z",
        ahora: AHORA,
      }),
    ).toEqual({ estado: "vencido", diasVencido: 0 });
  });

  it("cuenta hace cuánto se venció", () => {
    expect(
      estadoVerificacionEmail({
        emailConfirmado: false,
        creadoEn: "2026-08-16T12:00:00Z",
        ahora: AHORA,
      }),
    ).toEqual({ estado: "vencido", diasVencido: 3 });
  });

  it("sin fecha de alta avisa suave, no apura", () => {
    // El dato que falta es nuestro: apurar a alguien por eso sería cobrarle un
    // error del sistema.
    for (const creadoEn of [null, undefined, "no-es-una-fecha"]) {
      expect(
        estadoVerificacionEmail({
          emailConfirmado: false,
          creadoEn,
          ahora: AHORA,
        }),
      ).toEqual({ estado: "pendiente", diasRestantes: DIAS_PARA_VERIFICAR });
    }
  });
});
