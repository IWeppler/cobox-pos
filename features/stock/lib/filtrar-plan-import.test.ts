import { describe, it, expect } from "vitest";
import { contarFiltros, filtrarItems } from "./filtrar-plan-import";
import type { ItemPlan } from "./import-productos-plan";

function item(parcial: Partial<ItemPlan> = {}): ItemPlan {
  return {
    fila: 2,
    producto: "Samsung A15",
    atributos: {},
    imei: null,
    stock: 1,
    precioCosto: null,
    precioVenta: 100,
    codigoBarras: null,
    accion: "SUMAR_STOCK",
    productoId: "p-1",
    varianteId: "v-1",
    categoriaId: null,
    categoriaNombre: null,
    errores: [],
    avisos: [],
    correcciones: [],
    ...parcial,
  };
}

const items: ItemPlan[] = [
  item({ fila: 2, accion: "CREAR_PRODUCTO", productoId: null, varianteId: null }),
  item({ fila: 3, accion: "CREAR_VARIANTE", varianteId: null, avisos: ["ojo"] }),
  item({ fila: 4, errores: ["El IMEI ya está cargado."], imei: "355" }),
  item({ fila: 5, avisos: ["El producto ya existe."] }),
  item({ fila: 6, imei: "356" }),
];

describe("filtrarItems", () => {
  it("todas devuelve todo", () => {
    expect(filtrarItems(items, "todas")).toHaveLength(5);
  });

  it("error devuelve solo las bloqueadas", () => {
    expect(filtrarItems(items, "error").map((i) => i.fila)).toEqual([4]);
  });

  it("aviso NO incluye las que además tienen error", () => {
    const conAmbos = [item({ fila: 9, errores: ["x"], avisos: ["y"] })];
    expect(filtrarItems(conAmbos, "aviso")).toHaveLength(0);
    expect(filtrarItems(conAmbos, "error")).toHaveLength(1);
  });

  it("una acción no cuenta las filas bloqueadas: no se van a escribir", () => {
    const bloqueada = [
      item({ fila: 9, accion: "CREAR_PRODUCTO", errores: ["falta precio"] }),
    ];
    expect(filtrarItems(bloqueada, "CREAR_PRODUCTO")).toHaveLength(0);
  });

  it("imei filtra por unidad serializada", () => {
    expect(filtrarItems(items, "imei").map((i) => i.fila)).toEqual([4, 6]);
  });

  it("cambiadas usa el set que le pasan", () => {
    expect(
      filtrarItems(items, "cambiadas", new Set([3, 5])).map((i) => i.fila),
    ).toEqual([3, 5]);
  });

  it("cambiadas sin set no devuelve nada", () => {
    expect(filtrarItems(items, "cambiadas")).toHaveLength(0);
  });
});

describe("contarFiltros", () => {
  it("cuenta cada filtro por separado", () => {
    const conteo = contarFiltros(items, new Set([3]));
    expect(conteo.todas).toBe(5);
    expect(conteo.error).toBe(1);
    expect(conteo.aviso).toBe(2);
    expect(conteo.imei).toBe(2);
    expect(conteo.cambiadas).toBe(1);
    expect(conteo.CREAR_PRODUCTO).toBe(1);
    expect(conteo.CREAR_VARIANTE).toBe(1);
    expect(conteo.SUMAR_STOCK).toBe(2);
  });

  it("error + aviso + sin nada suman el total", () => {
    const conteo = contarFiltros(items);
    const sinNada = items.filter(
      (i) => i.errores.length === 0 && i.avisos.length === 0,
    ).length;
    expect(conteo.error + conteo.aviso + sinNada).toBe(conteo.todas);
  });

  it("una lista vacía da todo en cero", () => {
    const conteo = contarFiltros([]);
    expect(Object.values(conteo).every((n) => n === 0)).toBe(true);
  });
});
