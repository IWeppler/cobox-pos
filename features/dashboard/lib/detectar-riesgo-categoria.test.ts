import { describe, it, expect } from "vitest";
import { detectarCategoriasEnRiesgo } from "./detectar-riesgo-categoria";
import type { Venta } from "@/entities/ventas/types";
import type { Producto } from "@/entities/productos/types";

const AHORA = new Date(2026, 6, 22, 12, 0, 0);
const VENTANA_DIAS = 14;

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

function producto(id: string, categoriaId: string, stockTotal: number): Producto {
  return {
    id,
    nombre: id,
    tipo: "x",
    precio: 0,
    precio_costo: 0,
    imagen_url: null,
    thumbnail_url: null,
    grid_url: null,
    creado_en: "",
    publicado: true,
    slug: null,
    categoria_id: categoriaId,
    stock: stockTotal > 0 ? [{ id: `${id}-s1`, variante: "u", cantidad: stockTotal }] : [],
  } as Producto;
}

describe("detectarCategoriasEnRiesgo", () => {
  it("detecta categoría con alta rotación y stock por debajo de la cobertura crítica", () => {
    // 20 unidades vendidas en 14 días => ~1.43 u/día, stock 5 => ~3.5 días de cobertura
    const ventas = [venta("2026-07-20T10:00:00", [{ producto_id: "p1", cantidad: 20 }])];
    const productos = [producto("p1", "cat-remeras", 5)];
    const r = detectarCategoriasEnRiesgo(ventas, productos, VENTANA_DIAS, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0].categoriaId).toBe("cat-remeras");
    expect(r[0].unidadesVendidas).toBe(20);
    expect(r[0].stockRestante).toBe(5);
    expect(r[0].diasCobertura).toBeCloseTo(3.5, 1);
  });

  it("no dispara si la categoría tiene pocas unidades vendidas (piso anti-ruido)", () => {
    const ventas = [venta("2026-07-20T10:00:00", [{ producto_id: "p1", cantidad: 2 }])];
    const productos = [producto("p1", "cat-remeras", 1)];
    expect(detectarCategoriasEnRiesgo(ventas, productos, VENTANA_DIAS, AHORA)).toEqual([]);
  });

  it("no dispara si el stock remanente todavía alcanza para más de la cobertura crítica", () => {
    const ventas = [venta("2026-07-20T10:00:00", [{ producto_id: "p1", cantidad: 20 }])];
    const productos = [producto("p1", "cat-remeras", 500)];
    expect(detectarCategoriasEnRiesgo(ventas, productos, VENTANA_DIAS, AHORA)).toEqual([]);
  });

  it("suma unidades y stock de varios productos de la misma categoría", () => {
    const ventas = [
      venta("2026-07-20T10:00:00", [
        { producto_id: "p1", cantidad: 10 },
        { producto_id: "p2", cantidad: 10 },
      ]),
    ];
    const productos = [
      producto("p1", "cat-remeras", 3),
      producto("p2", "cat-remeras", 2),
    ];
    const r = detectarCategoriasEnRiesgo(ventas, productos, VENTANA_DIAS, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0].unidadesVendidas).toBe(20);
    expect(r[0].stockRestante).toBe(5);
  });

  it("ignora ventas fuera de la ventana de rotación", () => {
    const ventas = [venta("2026-05-01T10:00:00", [{ producto_id: "p1", cantidad: 20 }])];
    const productos = [producto("p1", "cat-remeras", 5)];
    expect(detectarCategoriasEnRiesgo(ventas, productos, VENTANA_DIAS, AHORA)).toEqual([]);
  });

  it("ordena por días de cobertura ascendente (la más urgente primero)", () => {
    const ventas = [
      venta("2026-07-20T10:00:00", [
        { producto_id: "p1", cantidad: 20 }, // stock 9 => 6.3 días
        { producto_id: "p2", cantidad: 20 }, // stock 2 => 1.4 días
      ]),
    ];
    const productos = [
      producto("p1", "cat-remeras", 9),
      producto("p2", "cat-pantalones", 2),
    ];
    const r = detectarCategoriasEnRiesgo(ventas, productos, VENTANA_DIAS, AHORA);
    expect(r.map((c) => c.categoriaId)).toEqual(["cat-pantalones", "cat-remeras"]);
  });
});
