import { describe, expect, it } from "vitest";
import {
  ANCHO_TICKET_DEFAULT,
  cssImpresionTicket,
  normalizarAnchoTicket,
} from "./ancho-ticket";

describe("normalizarAnchoTicket", () => {
  it("acepta los dos anchos reales", () => {
    expect(normalizarAnchoTicket(58)).toBe(58);
    expect(normalizarAnchoTicket(80)).toBe(80);
  });

  it("acepta el número como texto, que es como vuelve de un form", () => {
    expect(normalizarAnchoTicket("58")).toBe(58);
  });

  it("cualquier otra cosa cae en 80, que es lo que se imprime hoy", () => {
    // Fail-closed: un valor raro no puede dejar la impresión sin ancho.
    for (const valor of [null, undefined, "", "ancho", 0, 76, NaN, {}]) {
      expect(normalizarAnchoTicket(valor)).toBe(ANCHO_TICKET_DEFAULT);
    }
    expect(ANCHO_TICKET_DEFAULT).toBe(80);
  });
});

describe("cssImpresionTicket", () => {
  it("el @page y el ancho del ticket dicen SIEMPRE lo mismo", () => {
    // Es el motivo por el que esto vive en una función y no en el componente:
    // con dos definiciones, el papel y el contenido terminan en anchos
    // distintos y eso solo se descubre imprimiendo.
    for (const ancho of [58, 80] as const) {
      const css = cssImpresionTicket(ancho);
      const medidas = css.match(/(\d+)mm/g) ?? [];

      expect(medidas.length).toBeGreaterThan(3);
      expect(new Set(medidas)).toEqual(new Set([`${ancho}mm`]));
    }
  });

  it("esconde TODO lo demás, no solo el interior del sheet", () => {
    // El bug que esto arregla: Radix portea el sheet a `body`, así que el POS
    // de atrás seguía en el árbol y salía impreso.
    const css = cssImpresionTicket(80);

    expect(css).toContain("body * { visibility: hidden !important; }");
    expect(css).toContain("#ticket-print-wrapper * { visibility: visible");
  });

  it("usa visibility y no display para esconder", () => {
    // Con `display:none` en el body, el ticket —que está adentro—
    // desaparecería también: un hijo no puede revertir el display del padre.
    const css = cssImpresionTicket(80);
    expect(css).not.toMatch(/body \*[^}]*display:\s*none/);
  });

  it("a 58mm el cuerpo es más chico", () => {
    expect(cssImpresionTicket(58)).toContain("font-size: 10pt");
    expect(cssImpresionTicket(80)).toContain("font-size: 12pt");
  });
});
