import { describe, expect, it } from "vitest";
import {
  agruparPorRemito,
  clasificarOrigen,
  filtrarMovimientos,
  paginar,
  resumirMovimientos,
} from "./agrupar-movimientos";
import type { MovimientoStock } from "@/features/stock/actions/get-movimientos-stock";

function mov(over: Partial<MovimientoStock> = {}): MovimientoStock {
  return {
    id: "m1",
    fecha: "2026-08-10T10:00:00Z",
    productoId: "p1",
    producto: "Remera lisa",
    variante: "M",
    tipo: "INGRESO",
    cantidad: 3,
    origen: "Remito — Textiles SA",
    usuario: null,
    ...over,
  };
}

describe("clasificarOrigen", () => {
  it("reconoce las cinco fuentes", () => {
    expect(clasificarOrigen(mov({ remitoId: "r1" }))).toBe("remito");
    expect(clasificarOrigen(mov({ origen: "Venta #abc123", remitoId: undefined }))).toBe("venta");
    expect(
      clasificarOrigen(mov({ origen: "Devolución de cliente — Venta #abc" })),
    ).toBe("devolucion");
    expect(clasificarOrigen(mov({ origen: "Baja de inventario — Roto" }))).toBe("baja");
    expect(clasificarOrigen(mov({ origen: "Ajuste manual" }))).toBe("ajuste");
  });

  it("un ingreso de remito se reconoce por el id, no por el texto", () => {
    // El proveedor puede llamarse "Ventas del Sur" y el texto empezaría con
    // "Remito — Ventas...", pero lo que manda es tener remitoId.
    expect(
      clasificarOrigen(mov({ remitoId: "r1", origen: "Remito — Ventas del Sur" })),
    ).toBe("remito");
  });
});

describe("filtrarMovimientos", () => {
  const lista = [
    mov({ id: "a", producto: "Remera lisa", remitoId: "r1" }),
    mov({ id: "b", producto: "Pantalón", tipo: "EGRESO", origen: "Venta #123" }),
    mov({
      id: "c",
      producto: "Campera",
      tipo: "EGRESO",
      origen: "Baja de inventario — Fallado",
      usuario: "Mara",
    }),
  ];

  it("filtra por tipo", () => {
    const res = filtrarMovimientos(lista, {
      busqueda: "",
      tipo: "EGRESO",
      origen: "todos",
    });
    expect(res.map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("filtra por origen", () => {
    const res = filtrarMovimientos(lista, {
      busqueda: "",
      tipo: "todos",
      origen: "remito",
    });
    expect(res.map((m) => m.id)).toEqual(["a"]);
  });

  it("busca también por origen y por usuario, no solo por producto", () => {
    // "Quién dio de baja esto" y "qué trajo tal proveedor" son las preguntas
    // reales de la pantalla.
    expect(
      filtrarMovimientos(lista, { busqueda: "mara", tipo: "todos", origen: "todos" }),
    ).toHaveLength(1);
    expect(
      filtrarMovimientos(lista, { busqueda: "textiles", tipo: "todos", origen: "todos" }),
    ).toHaveLength(1);
  });

  it("la búsqueda ignora mayúsculas y espacios de más", () => {
    expect(
      filtrarMovimientos(lista, { busqueda: "  CAMPERA ", tipo: "todos", origen: "todos" }),
    ).toHaveLength(1);
  });
});

describe("agruparPorRemito", () => {
  const lista = [
    mov({ id: "1", remitoId: "r1", proveedor: "Textiles SA", productoId: "p1", cantidad: 3 }),
    mov({ id: "2", remitoId: "r1", proveedor: "Textiles SA", productoId: "p1", cantidad: 2 }),
    mov({ id: "3", remitoId: "r1", proveedor: "Textiles SA", productoId: "p2", cantidad: 5 }),
    mov({
      id: "4",
      remitoId: "r2",
      proveedor: "Otro",
      fecha: "2026-08-12T10:00:00Z",
      cantidad: 1,
    }),
    mov({ id: "5", origen: "Venta #1", tipo: "EGRESO" }),
  ];

  it("agrupa y distingue líneas de unidades de productos", () => {
    const [, textiles] = agruparPorRemito(lista);

    expect(textiles.lineas).toBe(3);
    expect(textiles.unidades).toBe(10);
    // El mismo producto en dos talles son dos líneas de UN producto.
    expect(textiles.productos).toBe(2);
  });

  it("deja afuera lo que no es remito", () => {
    const remitos = agruparPorRemito(lista);
    expect(remitos).toHaveLength(2);
    expect(remitos.flatMap((r) => r.items.map((i) => i.id))).not.toContain("5");
  });

  it("ordena del más reciente al más viejo", () => {
    expect(agruparPorRemito(lista).map((r) => r.remitoId)).toEqual(["r2", "r1"]);
  });
});

describe("paginar", () => {
  const filas = Array.from({ length: 120 }, (_, i) => i);

  it("corta y reporta el rango visible", () => {
    const p = paginar(filas, 2, 50);
    expect(p.filas).toHaveLength(50);
    expect(p.filas[0]).toBe(50);
    expect(p.desde).toBe(51);
    expect(p.hasta).toBe(100);
    expect(p.totalPaginas).toBe(3);
  });

  it("una página fuera de rango se corrige a la última", () => {
    // Pasa siempre: se filtra estando en la página 5 y quedan dos.
    const p = paginar(filas, 99, 50);
    expect(p.pagina).toBe(3);
    expect(p.filas).toHaveLength(20);
  });

  it("sin filas no dice 'mostrando 1 de 0'", () => {
    const p = paginar([], 1, 50);
    expect(p.desde).toBe(0);
    expect(p.hasta).toBe(0);
    expect(p.totalPaginas).toBe(1);
  });
});

describe("resumirMovimientos", () => {
  it("suma unidades por tipo y deja ver el neto negativo", () => {
    const resumen = resumirMovimientos([
      mov({ cantidad: 10 }),
      mov({ cantidad: 4, tipo: "EGRESO" }),
      mov({ cantidad: 9, tipo: "EGRESO" }),
    ]);

    expect(resumen).toEqual({ ingresos: 10, egresos: 13, neto: -3 });
  });
});
