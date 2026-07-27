import { Producto } from "@/entities/productos/types";
import { Venta, VentaItem } from "@/entities/ventas/types";

export type QuiebreProducto = {
  productoId: string;
  nombre: string;
  unidadesVendidas: number;
};

/**
 * "Quiebre de rotación reciente": producto que SÍ tuvo demanda en los
 * últimos `ventanaDias` días pero HOY está en stock total 0 — a diferencia
 * de "stock crítico" (≤3, sigue vendible) esto ya está perdiendo ventas
 * ahora mismo. Ordenado por unidades vendidas en la ventana (el que más
 * se pedía primero, mayor urgencia de reponer).
 */
export function detectarQuiebresRotacion(
  ventasOperativas: Venta[],
  productos: Producto[],
  ventanaDias: number,
  ahora: Date,
): QuiebreProducto[] {
  const inicioVentana = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate() - ventanaDias,
  );

  const unidadesPorProducto = new Map<string, number>();

  for (const venta of ventasOperativas) {
    const fecha = new Date(venta.fecha_venta);
    if (fecha < inicioVentana) continue;

    const items = (venta.ventas_items || []) as VentaItem[];
    for (const item of items) {
      if (!item.producto_id) continue;
      const actual = unidadesPorProducto.get(item.producto_id) ?? 0;
      unidadesPorProducto.set(
        item.producto_id,
        actual + Number(item.cantidad || 0),
      );
    }
  }

  if (unidadesPorProducto.size === 0) return [];

  const productosById = new Map(productos.map((p) => [p.id, p]));

  const quiebres: QuiebreProducto[] = [];
  for (const [productoId, unidadesVendidas] of unidadesPorProducto) {
    const producto = productosById.get(productoId);
    if (!producto) continue;

    const stockTotal = (producto.stock || []).reduce(
      (acc, s) => acc + Number(s.cantidad || 0),
      0,
    );
    if (stockTotal > 0) continue;

    quiebres.push({ productoId, nombre: producto.nombre, unidadesVendidas });
  }

  return quiebres.sort((a, b) => b.unidadesVendidas - a.unidadesVendidas);
}
