import { describe, expect, it } from "vitest";
import { valoresDesdeLista, valorFirmado } from "./lista-precio-form";
import type { ListaPrecio } from "@/entities/precios/types";

/**
 * El signo es la única aritmética del formulario, y es la que puede convertir
 * "20% menos" en "20% más" sin que nadie se entere hasta la primera venta.
 * Por eso se testea la vuelta completa: base de datos → formulario → base de
 * datos.
 */

const lista = (parcial: Partial<ListaPrecio>): ListaPrecio => ({
  id: "x",
  nombre: "Mayorista",
  tipo_regla: "PORCENTAJE",
  valor: -20,
  admite_promociones: false,
  activa: true,
  ...parcial,
});

describe("el signo del porcentaje", () => {
  it("un descuento guardado en negativo se muestra como 'menos 20'", () => {
    const v = valoresDesdeLista(lista({ valor: -20 }));

    expect(v.direccion).toBe("menos");
    expect(v.magnitud).toBe("20");
  });

  it("un recargo guardado en positivo se muestra como 'más 15'", () => {
    const v = valoresDesdeLista(lista({ valor: 15 }));

    expect(v.direccion).toBe("mas");
    expect(v.magnitud).toBe("15");
  });

  it("la vuelta completa no cambia el número", () => {
    for (const valor of [-20, 15, -7.5, 0]) {
      expect(valorFirmado(valoresDesdeLista(lista({ valor })))).toBe(valor);
    }
  });

  it("'menos 20' se guarda como -20, que es lo que la lista tiene que hacer", () => {
    expect(
      valorFirmado({
        nombre: "Mayorista",
        tipoRegla: "PORCENTAJE",
        magnitud: "20",
        direccion: "menos",
        admitePromociones: false,
      }),
    ).toBe(-20);
  });

  it("acepta la coma como decimal, que es como se tipea acá", () => {
    expect(
      valorFirmado({
        nombre: "Mayorista",
        tipoRegla: "PORCENTAJE",
        magnitud: "12,5",
        direccion: "menos",
        admitePromociones: false,
      }),
    ).toBe(-12.5);
  });
});

describe("el markup", () => {
  it("no lleva signo: un multiplicador negativo no existe", () => {
    expect(
      valorFirmado({
        nombre: "Por costo",
        tipoRegla: "MARKUP",
        magnitud: "1.5",
        // Aunque el selector hubiera quedado en "menos" al cambiar de regla.
        direccion: "menos",
        admitePromociones: false,
      }),
    ).toBe(1.5);
  });

  it("se siembra desde la base sin perder los decimales", () => {
    const v = valoresDesdeLista(lista({ tipo_regla: "MARKUP", valor: 1.5 }));

    expect(v.tipoRegla).toBe("MARKUP");
    expect(v.magnitud).toBe("1.5");
    expect(valorFirmado(v)).toBe(1.5);
  });
});

describe("el alta", () => {
  it("arranca en 20% menos y sin promociones acumuladas", () => {
    const v = valoresDesdeLista(null);

    expect(v.direccion).toBe("menos");
    expect(valorFirmado(v)).toBe(-20);
    // Default false, igual que la columna: acumular sin decidirlo se come el
    // margen.
    expect(v.admitePromociones).toBe(false);
  });
});
