import { describe, it, expect } from "vitest";
import {
  firmarPlanImport,
  firmaDesactualizada,
  filasQueCambiaron,
} from "./firma-plan-import";
import type { ItemPlan, PlanImport } from "./import-productos-plan";

function item(parcial: Partial<ItemPlan> = {}): ItemPlan {
  return {
    fila: 2,
    producto: "Samsung A15",
    atributos: { Color: "Negro" },
    imei: null,
    stock: 3,
    precioCosto: 100,
    precioVenta: 200,
    codigoBarras: "779123",
    accion: "CREAR_PRODUCTO",
    productoId: null,
    varianteId: null,
    categoriaId: "cat-1",
    categoriaNombre: "Celulares",
    errores: [],
    avisos: [],
    correcciones: [],
    ...parcial,
  };
}

function plan(items: ItemPlan[]): PlanImport {
  return {
    items,
    resumen: {
      productosNuevos: 0,
      variantesNuevas: 0,
      filasQueSumanStock: 0,
      unidadesSerie: 0,
      unidadesTotales: 0,
      filasConError: 0,
    },
  };
}

describe("firmarPlanImport", () => {
  it("el mismo plan da la misma firma", () => {
    expect(firmarPlanImport(plan([item()])).hash).toBe(
      firmarPlanImport(plan([item()])).hash,
    );
  });

  it("cambiar la acción cambia la firma", () => {
    const antes = firmarPlanImport(plan([item({ accion: "CREAR_PRODUCTO" })]));
    const ahora = firmarPlanImport(
      plan([item({ accion: "SUMAR_STOCK", varianteId: "v-1" })]),
    );
    expect(firmaDesactualizada(antes, ahora)).toBe(true);
  });

  it("cambiar el destino cambia la firma aunque la acción sea la misma", () => {
    const antes = firmarPlanImport(
      plan([item({ accion: "SUMAR_STOCK", varianteId: "v-1" })]),
    );
    const ahora = firmarPlanImport(
      plan([item({ accion: "SUMAR_STOCK", varianteId: "v-2" })]),
    );
    expect(firmaDesactualizada(antes, ahora)).toBe(true);
  });

  it("una fila que pasa a estar bloqueada cambia la firma", () => {
    const antes = firmarPlanImport(plan([item({ imei: "355", errores: [] })]));
    const ahora = firmarPlanImport(
      plan([item({ imei: "355", errores: ["El IMEI 355 ya está cargado."] })]),
    );
    expect(firmaDesactualizada(antes, ahora)).toBe(true);
  });

  it("un aviso nuevo NO cambia la firma: no cambia lo que se escribe", () => {
    const antes = firmarPlanImport(plan([item({ avisos: [] })]));
    const ahora = firmarPlanImport(
      plan([item({ avisos: ["Sin precio de costo: se guarda en 0."] })]),
    );
    expect(firmaDesactualizada(antes, ahora)).toBe(false);
  });

  it("firma faltante cuenta como desactualizada (fail-closed)", () => {
    expect(firmaDesactualizada(null, firmarPlanImport(plan([item()])))).toBe(
      true,
    );
  });

  it("otra versión de firma cuenta como desactualizada", () => {
    const actual = firmarPlanImport(plan([item()]));
    expect(firmaDesactualizada({ ...actual, version: 0 }, actual)).toBe(true);
  });
});

describe("filasQueCambiaron", () => {
  it("devuelve solo las filas cuya decisión cambió", () => {
    const antes = firmarPlanImport(
      plan([
        item({ fila: 2 }),
        item({ fila: 3, producto: "Motorola" }),
        item({ fila: 4, producto: "Xiaomi" }),
      ]),
    );
    const ahora = firmarPlanImport(
      plan([
        item({ fila: 2 }),
        item({ fila: 3, producto: "Motorola", accion: "SUMAR_STOCK", varianteId: "v-9" }),
        item({ fila: 4, producto: "Xiaomi", stock: 99 }),
      ]),
    );
    expect(filasQueCambiaron(antes, ahora)).toEqual([3, 4]);
  });

  it("una fila que desaparece también cuenta como cambio", () => {
    const antes = firmarPlanImport(plan([item({ fila: 2 }), item({ fila: 3 })]));
    const ahora = firmarPlanImport(plan([item({ fila: 2 })]));
    expect(filasQueCambiaron(antes, ahora)).toEqual([3]);
  });

  it("planes iguales no reportan cambios", () => {
    const antes = firmarPlanImport(plan([item({ fila: 2 }), item({ fila: 3 })]));
    const ahora = firmarPlanImport(plan([item({ fila: 2 }), item({ fila: 3 })]));
    expect(filasQueCambiaron(antes, ahora)).toEqual([]);
  });

  it("ordena por número de fila, no alfabéticamente", () => {
    const base = [item({ fila: 2 }), item({ fila: 10 }), item({ fila: 3 })];
    const antes = firmarPlanImport(plan(base));
    const ahora = firmarPlanImport(
      plan(base.map((i) => ({ ...i, stock: i.stock + 1 }))),
    );
    expect(filasQueCambiaron(antes, ahora)).toEqual([2, 3, 10]);
  });
});
