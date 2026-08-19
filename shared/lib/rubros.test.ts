import { describe, expect, it } from "vitest";
import { RUBROS, rubroOperativoDesde } from "./rubros";
import { RUBROS_VALIDOS } from "@/entities/config/types";

describe("rubroOperativoDesde", () => {
  it("mapea los 15 rubros comerciales a un operativo válido", () => {
    // El freno de verdad: ningún rubro comercial puede quedar sin traducción.
    // Antes, 12 de los 15 caían en indumentaria y recibían la plantilla de ropa.
    for (const { valor } of RUBROS) {
      expect(RUBROS_VALIDOS).toContain(rubroOperativoDesde(valor));
    }
  });

  it("ferretería es su propio operativo, no electro", () => {
    // Un tornillo se pide por medida y material; la plantilla de electro no
    // tiene ninguna de las dos columnas.
    expect(rubroOperativoDesde("ferreteria")).toBe("ferreteria");
  });

  it("lo que se pide por peso o envase va a alimentos", () => {
    expect(rubroOperativoDesde("almacen")).toBe("alimentos");
    expect(rubroOperativoDesde("panaderia")).toBe("alimentos");
    expect(rubroOperativoDesde("gastronomia")).toBe("alimentos");
    expect(rubroOperativoDesde("bebidas")).toBe("alimentos");
    expect(rubroOperativoDesde("mascotas")).toBe("alimentos");
  });

  it("lo que se pide por presentación va a farmacia", () => {
    expect(rubroOperativoDesde("farmacia")).toBe("farmacia");
    expect(rubroOperativoDesde("cosmetica")).toBe("farmacia");
    expect(rubroOperativoDesde("suplementos")).toBe("farmacia");
  });

  it("lo que no tiene columnas propias va a otros", () => {
    expect(rubroOperativoDesde("bazar")).toBe("otros");
    expect(rubroOperativoDesde("libreria")).toBe("otros");
    expect(rubroOperativoDesde("jugueteria")).toBe("otros");
    expect(rubroOperativoDesde("otro")).toBe("otros");
  });

  it("indumentaria y electrónica no cambiaron de rama", () => {
    // Los 4 negocios vivos: si esto cambia, cambia su plantilla de ingreso.
    expect(rubroOperativoDesde("indumentaria")).toBe("indumentaria");
    expect(rubroOperativoDesde("electronica")).toBe("electro");
  });

  it("un valor desconocido cae a indumentaria, igual que normalizarRubro", () => {
    expect(rubroOperativoDesde("carniceria")).toBe("indumentaria");
    expect(rubroOperativoDesde(null)).toBe("indumentaria");
    expect(rubroOperativoDesde(undefined)).toBe("indumentaria");
    expect(rubroOperativoDesde("")).toBe("indumentaria");
  });
});
