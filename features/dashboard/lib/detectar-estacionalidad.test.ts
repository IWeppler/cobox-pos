import { describe, it, expect } from "vitest";
import {
  detectarFinDeTemporada,
  detectarProximaTemporada,
} from "./detectar-estacionalidad";
import type { CategoriaBase } from "@/shared/utils/category-tree";
import type { Venta } from "@/entities/ventas/types";
import type { Producto } from "@/entities/productos/types";

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

function producto(
  id: string,
  categoriaId: string,
  stockTotal: number,
  precioCosto = 1000,
): Producto {
  return {
    id,
    nombre: id,
    tipo: "x",
    precio: 0,
    precio_costo: precioCosto,
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

function categoria(id: string, slug: string, parentId: string | null = null): CategoriaBase {
  return { id, nombre: slug, slug, parent_id: parentId };
}

describe("detectarFinDeTemporada", () => {
  const MEDIADOS_SEPTIEMBRE = new Date(2026, 8, 20); // dentro de últimas 3 semanas de invierno (fin 30 sep)

  it("detecta invierno con stock valorizado alto y poca rotación reciente", () => {
    const categorias = [categoria("c-camperas", "camperas-de-hombre")];
    // 100 unidades a costo 1000 = $100.000 valorizado, total del inventario
    // también $100.000 => 100% > 15% (alto). Sin ventas recientes => rotación 0.
    const productos = [producto("p1", "c-camperas", 100, 1000)];
    const r = detectarFinDeTemporada(
      [],
      productos,
      categorias,
      100000, // stockValorizadoCostoTotal
      14,
      MEDIADOS_SEPTIEMBRE,
    );
    expect(r).not.toBeNull();
    expect(r?.temporada).toBe("invierno");
    expect(r?.valorizado).toBe(100000);
  });

  it("no dispara si la categoría está rotando bien", () => {
    const categorias = [categoria("c-camperas", "camperas-de-hombre")];
    const productos = [producto("p1", "c-camperas", 100, 1000)];
    // 20 unidades vendidas / 100 en stock = 20% de rotación, por encima del 5% piso.
    const ventas = [venta("2026-09-15T10:00:00", [{ producto_id: "p1", cantidad: 20 }])];
    const r = detectarFinDeTemporada([...ventas], productos, categorias, 100000, 14, MEDIADOS_SEPTIEMBRE);
    expect(r).toBeNull();
  });

  it("no dispara si el valorizado de la categoría es chico relativo al total", () => {
    const categorias = [categoria("c-camperas", "camperas-de-hombre")];
    const productos = [producto("p1", "c-camperas", 5, 1000)]; // $5.000 de $1.000.000 total = 0.5%
    const r = detectarFinDeTemporada([], productos, categorias, 1000000, 14, MEDIADOS_SEPTIEMBRE);
    expect(r).toBeNull();
  });

  it("no dispara fuera de la ventana de fin de temporada", () => {
    const categorias = [categoria("c-camperas", "camperas-de-hombre")];
    const productos = [producto("p1", "c-camperas", 100, 1000)];
    const mediadosInvierno = new Date(2026, 6, 15); // 15 jul, lejos del fin (30 sep)
    const r = detectarFinDeTemporada([], productos, categorias, 100000, 14, mediadosInvierno);
    expect(r).toBeNull();
  });

  it("matchea por la categoría ancestro cuando el producto está en una subcategoría", () => {
    const categorias = [
      categoria("c-hombre", "hombre"),
      categoria("c-camperas-hombre", "camperas", "c-hombre"),
    ];
    const productos = [producto("p1", "c-camperas-hombre", 100, 1000)];
    const r = detectarFinDeTemporada([], productos, categorias, 100000, 14, MEDIADOS_SEPTIEMBRE);
    expect(r).not.toBeNull();
  });
});

describe("detectarProximaTemporada", () => {
  const MEDIADOS_MAYO = new Date(2026, 4, 15); // ~2.5 semanas antes del 1 jun (invierno)

  it("detecta invierno próximo con stock bajo relativo al promedio de categorías", () => {
    const categorias = [
      categoria("c-camperas", "camperas"),
      categoria("c-remeras", "remeras"),
      categoria("c-jeans", "jeans"),
    ];
    const productos = [
      producto("p1", "c-camperas", 2), // muy poco stock de invierno
      producto("p2", "c-remeras", 100),
      producto("p3", "c-jeans", 100),
    ];
    const r = detectarProximaTemporada(productos, categorias, MEDIADOS_MAYO);
    expect(r).not.toBeNull();
    expect(r?.temporada).toBe("invierno");
    expect(r?.stockUnidades).toBe(2);
  });

  it("no dispara si el stock de la temporada próxima ya está en línea con el promedio", () => {
    const categorias = [categoria("c-camperas", "camperas"), categoria("c-remeras", "remeras")];
    const productos = [
      producto("p1", "c-camperas", 100),
      producto("p2", "c-remeras", 100),
    ];
    const r = detectarProximaTemporada(productos, categorias, MEDIADOS_MAYO);
    expect(r).toBeNull();
  });

  it("no dispara fuera de la ventana de pre-temporada", () => {
    const categorias = [categoria("c-camperas", "camperas"), categoria("c-remeras", "remeras")];
    const productos = [
      producto("p1", "c-camperas", 1),
      producto("p2", "c-remeras", 100),
    ];
    const enero = new Date(2026, 0, 15);
    const r = detectarProximaTemporada(productos, categorias, enero);
    expect(r).toBeNull();
  });

  it("detecta fiestas próximas con stock bajo de ropa de salir", () => {
    const categorias = [
      categoria("c-vestidos", "vestidos"),
      categoria("c-remeras", "remeras"),
    ];
    const productos = [
      producto("p1", "c-vestidos", 1),
      producto("p2", "c-remeras", 100),
    ];
    const mediadosOctubre = new Date(2026, 9, 15); // ~2.5 semanas antes del 1 nov
    const r = detectarProximaTemporada(productos, categorias, mediadosOctubre);
    expect(r).not.toBeNull();
    expect(r?.temporada).toBe("fiestas");
  });
});
