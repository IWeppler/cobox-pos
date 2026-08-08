import { describe, it, expect } from "vitest";
import { metodoIngresoStock } from "./ingreso-por-rubro";
import type { Rubro } from "@/entities/config/types";

describe("metodoIngresoStock", () => {
  it("electro entra por planilla", () => {
    expect(metodoIngresoStock("electro")).toBe("planilla");
  });

  it("indumentaria entra por remito", () => {
    expect(metodoIngresoStock("indumentaria")).toBe("remito");
  });

  it("fail-closed: cualquier otro rubro entra por remito", () => {
    const otros: Rubro[] = [
      "alimentos",
      "farmacia",
      "ferreteria",
      "quioscos",
      "otros",
    ];
    for (const rubro of otros) {
      expect(metodoIngresoStock(rubro)).toBe("remito");
    }
  });
});
