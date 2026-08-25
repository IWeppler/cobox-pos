import { describe, it, expect } from "vitest";
import { telefonoAWhatsapp, linkWhatsapp } from "@/shared/lib/telefono-whatsapp";

describe("telefonoAWhatsapp", () => {
  it("el formato real de la base: 10 dígitos sin país ni 9", () => {
    // 101 de los 105 teléfonos de Evens tienen exactamente esta forma.
    expect(telefonoAWhatsapp("1154702118")).toBe("5491154702118");
  });

  it("ignora separadores", () => {
    expect(telefonoAWhatsapp("11 5470-2118")).toBe("5491154702118");
    expect(telefonoAWhatsapp("(11) 5470 2118")).toBe("5491154702118");
  });

  it("no duplica el país ni el 9 si ya venían", () => {
    expect(telefonoAWhatsapp("+5491154702118")).toBe("5491154702118");
    expect(telefonoAWhatsapp("541154702118")).toBe("5491154702118");
  });

  it("saca el 0 de larga distancia", () => {
    expect(telefonoAWhatsapp("01154702118")).toBe("5491154702118");
  });

  it("un fijo sin área no es un celular: null", () => {
    // "41218474" existe en la base de Evens. Mandarle un WhatsApp a un número
    // armado a partir de esto es mandárselo a un desconocido.
    expect(telefonoAWhatsapp("41218474")).toBeNull();
  });

  it("fail-closed con lo que no se puede reconocer", () => {
    expect(telefonoAWhatsapp(null)).toBeNull();
    expect(telefonoAWhatsapp("")).toBeNull();
    expect(telefonoAWhatsapp("sin teléfono")).toBeNull();
    expect(telefonoAWhatsapp("123")).toBeNull();
    // Con el 15 viejo adentro queda en 11 dígitos: adivinar dónde cortar
    // mandaría el mensaje a otra persona.
    expect(telefonoAWhatsapp("11154702118")).toBeNull();
  });

  it("funciona con áreas del interior (4+6 y 3+7)", () => {
    expect(telefonoAWhatsapp("3512345678")).toBe("5493512345678"); // Córdoba
    expect(telefonoAWhatsapp("2954123456")).toBe("5492954123456"); // Santa Rosa
  });
});

describe("linkWhatsapp", () => {
  it("con celular reconocible apunta al chat de esa persona", () => {
    const url = linkWhatsapp("1154702118", "hola");
    expect(url).toBe("https://wa.me/5491154702118?text=hola");
  });

  it("sin celular reconocible abre WhatsApp sin destinatario", () => {
    // El mensaje va igual: la dueña elige el contacto a mano. Es preferible a
    // mandarle el resumen de cuenta de una clienta a un número equivocado.
    expect(linkWhatsapp("41218474", "hola")).toBe("https://wa.me/?text=hola");
    expect(linkWhatsapp(null, "hola")).toBe("https://wa.me/?text=hola");
  });

  it("escapa el mensaje", () => {
    expect(linkWhatsapp(null, "Total: $1.000 & saldo")).toContain(
      encodeURIComponent("Total: $1.000 & saldo"),
    );
  });
});
