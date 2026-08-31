import { describe, expect, it } from "vitest";
import { estadoAcceso } from "./estado-acceso";

/** ISO a partir de un instante base más N minutos. */
function enMinutos(base: string, minutos: number): string {
  return new Date(new Date(base).getTime() + minutos * 60_000).toISOString();
}

const CONFIRMO = "2026-08-30T13:22:00.000Z";

describe("estadoAcceso", () => {
  it("sin confirmar el mail no hay nada que analizar", () => {
    expect(
      estadoAcceso({
        emailConfirmadoEn: null,
        ultimoIngreso: null,
        ultimaActividad: null,
      }),
    ).toBe("SIN_CONFIRMAR");
  });

  it("confirmó pero nunca ingresó", () => {
    expect(
      estadoAcceso({
        emailConfirmadoEn: CONFIRMO,
        ultimoIngreso: null,
        ultimaActividad: null,
      }),
    ).toBe("NO_ENTRO");
  });

  it("abrir el link y cerrar no es haber entrado", () => {
    // El link de confirmación abre sesión solo: sin esto, todo comercio que
    // confirma figura como "entró" y el panel no sirve para nada.
    expect(
      estadoAcceso({
        emailConfirmadoEn: CONFIRMO,
        ultimoIngreso: enMinutos(CONFIRMO, 0.35),
        ultimaActividad: enMinutos(CONFIRMO, 0.35),
      }),
    ).toBe("SOLO_EL_LINK");
  });

  it("actividad muy posterior a la confirmación sí es haber entrado", () => {
    // El caso real de PequeñasGigantes el 30/8/2026: sesión creada 21 segundos
    // después de confirmar, pero activa hasta 9 horas más tarde.
    expect(
      estadoAcceso({
        emailConfirmadoEn: CONFIRMO,
        ultimoIngreso: enMinutos(CONFIRMO, 0.35),
        ultimaActividad: enMinutos(CONFIRMO, 573),
      }),
    ).toBe("ENTRO");
  });

  it("un ingreso anterior a la confirmación no cuenta", () => {
    // Se registró, no confirmó, y le reenviaron el mail: ese login viejo no
    // dice nada sobre si pudo entrar con el link nuevo.
    expect(
      estadoAcceso({
        emailConfirmadoEn: CONFIRMO,
        ultimoIngreso: enMinutos(CONFIRMO, -120),
        ultimaActividad: enMinutos(CONFIRMO, -120),
      }),
    ).toBe("NO_ENTRO");
  });

  it("sin última actividad se usa el último ingreso", () => {
    expect(
      estadoAcceso({
        emailConfirmadoEn: CONFIRMO,
        ultimoIngreso: enMinutos(CONFIRMO, 240),
        ultimaActividad: null,
      }),
    ).toBe("ENTRO");
  });
});
