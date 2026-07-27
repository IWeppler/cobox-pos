import { describe, it, expect } from "vitest";
import { detectarQuiebresRotacion } from "./detectar-quiebres";
import type { Venta } from "@/entities/ventas/types";
import type { Producto } from "@/entities/productos/types";

const AHORA = new Date(2026, 6, 22, 12, 0, 0);

function venta(fecha: string, items: { producto_id: string; cantidad: number }[]): Venta {
  return {
    id: crypto.randomUUID(),
    total: 0,
    precio_costo: 0,
    cantidad: items.reduce((a, i) => a + i.cantidad, 0),
    fecha_venta: fecha,
    ventas_items: items.map((i) => ({
      id: crypto.randomUUID(),
      venta_id: "v",
      producto_id: i.producto_id,
      variante: "",
      cantidad: i.cantidad,
      precio_unitario: 0,
    })),
  } as Venta;
}

function producto(id: string, nombre: string, stockTotal: number): Producto {
  return {
    id,
    nombre,
    tipo: "x",
    precio: 0,
    precio_costo: 0,
    imagen_url: null,
    thumbnail_url: null,
    grid_url: null,
    creado_en: "",
    publicado: true,
    slug: null,
    stock: stockTotal > 0 ? [{ id: "s1", variante: "u", cantidad: stockTotal }] : [],
  } as Producto;
}

describe("detectarQuiebresRotacion", () => {
  it("detecta producto con ventas recientes y stock total 0", () => {
    const ventas = [venta("2026-07-20T10:00:00", [{ producto_id: "p1", cantidad: 5 }])];
    const productos = [producto("p1", "Remera", 0)];
    const r = detectarQuiebresRotacion(ventas, productos, 14, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ productoId: "p1", nombre: "Remera", unidadesVendidas: 5 });
  });

  it("ignora productos con stock > 0 aunque tengan ventas recientes", () => {
    const ventas = [venta("2026-07-20T10:00:00", [{ producto_id: "p1", cantidad: 5 }])];
    const productos = [producto("p1", "Remera", 3)];
    expect(detectarQuiebresRotacion(ventas, productos, 14, AHORA)).toEqual([]);
  });

  it("ignora ventas fuera de la ventana", () => {
    const ventas = [venta("2026-05-01T10:00:00", [{ producto_id: "p1", cantidad: 5 }])];
    const productos = [producto("p1", "Remera", 0)];
    expect(detectarQuiebresRotacion(ventas, productos, 14, AHORA)).toEqual([]);
  });

  it("un producto sin ventas recientes pero en stock 0 no aparece (no es 'reciente')", () => {
    const productos = [producto("p1", "Remera", 0)];
    expect(detectarQuiebresRotacion([], productos, 14, AHORA)).toEqual([]);
  });

  it("ordena por unidades vendidas descendente", () => {
    const ventas = [
      venta("2026-07-20T10:00:00", [{ producto_id: "p1", cantidad: 2 }]),
      venta("2026-07-21T10:00:00", [{ producto_id: "p2", cantidad: 9 }]),
    ];
    const productos = [producto("p1", "A", 0), producto("p2", "B", 0)];
    const r = detectarQuiebresRotacion(ventas, productos, 14, AHORA);
    expect(r.map((x) => x.productoId)).toEqual(["p2", "p1"]);
  });

  it("suma unidades de múltiples ventas del mismo producto", () => {
    const ventas = [
      venta("2026-07-20T10:00:00", [{ producto_id: "p1", cantidad: 2 }]),
      venta("2026-07-21T10:00:00", [{ producto_id: "p1", cantidad: 3 }]),
    ];
    const productos = [producto("p1", "A", 0)];
    const r = detectarQuiebresRotacion(ventas, productos, 14, AHORA);
    expect(r[0].unidadesVendidas).toBe(5);
  });
});
