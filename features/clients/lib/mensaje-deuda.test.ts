import { describe, it, expect } from "vitest";
import { construirMensajeDeuda } from "./mensaje-deuda";

const base = {
  nombreCliente: "María Fernanda López",
  saldo: 50000,
  montoRecargo: 0,
  saldoConRecargo: 50000,
  fechaVencimiento: null,
  diasVencido: null,
};

describe("construirMensajeDeuda", () => {
  it("saluda por el primer nombre", () => {
    expect(construirMensajeDeuda(base)).toContain("Hola María");
    expect(construirMensajeDeuda(base)).not.toContain("Hola María Fernanda");
  });

  it("el total es el saldo cuando no hay recargo", () => {
    expect(construirMensajeDeuda(base)).toContain("Total a pagar");
    expect(construirMensajeDeuda(base)).toContain("50.000");
  });

  it("con recargo por mora desglosa y el total es el que se va a cobrar", () => {
    // Mandar el saldo pelado y después cobrar más es la forma más rápida de
    // tener una discusión en el mostrador.
    const m = construirMensajeDeuda({
      ...base,
      montoRecargo: 7500,
      saldoConRecargo: 57500,
      diasVencido: 12,
    });

    expect(m).toContain("Recargo por mora");
    expect(m).toContain("57.500");
    expect(m).toContain("Venció hace 12 días");
  });

  it("el detalle va como LINK, no como lista de movimientos", () => {
    const m = construirMensajeDeuda({
      ...base,
      urlResumen: "https://comerz.app/r/8dbfef9fda5843448dd05d6e8e04b8d5",
    });
    expect(m).toContain("Ver el detalle: https://comerz.app/r/8dbfef");
  });

  it("sin link el mensaje sale igual, solo que sin detalle", () => {
    const m = construirMensajeDeuda(base);
    expect(m).not.toContain("Ver el detalle");
    expect(m).toContain("Total a pagar");
  });

  it("es corto: un recordatorio largo no se lee", () => {
    const m = construirMensajeDeuda({ ...base, urlResumen: "https://x.co/r/a" });
    const lineasConTexto = m.split("\n").filter((l) => l.trim());
    expect(lineasConTexto.length).toBeLessThanOrEqual(7);
  });

  it("nombra al comercio cuando se lo pasan", () => {
    const m = construirMensajeDeuda({ ...base, nombreComercio: "Evens" });
    expect(m).toContain("de Evens");
  });
});
