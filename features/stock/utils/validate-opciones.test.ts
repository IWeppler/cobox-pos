import { describe, it, expect } from "vitest";
import { findMissingRequiredAttributeValues } from "./validate-opciones";
import { slugify } from "@/shared/utils/slugify";
import type { Opcion } from "../types";

describe("findMissingRequiredAttributeValues", () => {
  it("bloquea cuando falta valor para un atributo requerido (Ropa Bebé exige Género)", () => {
    const opciones: Opcion[] = [
      { id: "1", nombre: "Talle", valores: ["0-3m"] },
    ];
    const requeridos = new Set([slugify("Género")]);

    const faltantes = findMissingRequiredAttributeValues(opciones, requeridos);

    expect(faltantes.has(slugify("Género"))).toBe(true);
  });

  it("no bloquea cuando el atributo requerido ya tiene valores cargados", () => {
    const opciones: Opcion[] = [
      { id: "1", nombre: "Talle", valores: ["0-3m"] },
      { id: "2", nombre: "Género", valores: ["Nena"] },
    ];
    const requeridos = new Set([slugify("Género")]);

    const faltantes = findMissingRequiredAttributeValues(opciones, requeridos);

    expect(faltantes.size).toBe(0);
  });

  it("una opción requerida presente pero sin valores todavía cuenta como faltante", () => {
    const opciones: Opcion[] = [
      { id: "1", nombre: "Género", valores: [], bloqueado: true },
    ];
    const requeridos = new Set([slugify("Género")]);

    const faltantes = findMissingRequiredAttributeValues(opciones, requeridos);

    expect(faltantes.has(slugify("Género"))).toBe(true);
  });

  it("categoría sin atributos requeridos no bloquea nada (Ropa Hombre)", () => {
    const opciones: Opcion[] = [{ id: "1", nombre: "Talle", valores: ["M"] }];
    const requeridos = new Set<string>();

    const faltantes = findMissingRequiredAttributeValues(opciones, requeridos);

    expect(faltantes.size).toBe(0);
  });
});
