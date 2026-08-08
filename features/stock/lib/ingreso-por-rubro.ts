import type { Rubro } from "@/entities/config/types";

/**
 * Cómo entra la mercadería según el rubro. Son DOS flujos distintos, no dos
 * botones para lo mismo:
 *
 * - "remito" (indumentaria): ImportarPedidoModal + la conciliación de
 *   /compras/merge. Pensado para la planilla del proveedor, que trae nombres
 *   que no coinciden con el catálogo: por eso hay alias, sugerencias de match
 *   y aprobación transaccional.
 * - "planilla" (electro): ImportProductosModal. Pensado para una planilla ya
 *   armada con las columnas del sistema (EAN, IMEI, modelo), donde cada
 *   aparato con número de serie va en su propia fila.
 *
 * Mostrar los dos en los dos rubros era la confusión: cada comercio ve el
 * suyo y nada más.
 */
export type MetodoIngresoStock = "remito" | "planilla";

/** Fail-closed igual que normalizarRubro: lo que no es electro entra por
 * remito, que es el flujo que ya usaban los comercios antes de T4. */
export function metodoIngresoStock(rubro: Rubro): MetodoIngresoStock {
  return rubro === "electro" ? "planilla" : "remito";
}
