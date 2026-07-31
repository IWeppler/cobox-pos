/**
 * Tipos de las unidades serializadas en el camino de venta.
 *
 * Viven en entities/ y no en la action porque los comparten el POS
 * (cliente), las actions (server) y las vistas de venta/ticket/ficha.
 */

/** Unidad ofrecida en el modal de selección. Solo se listan disponibles. */
export interface UnidadSerieDisponible {
  id: string;
  imei: string;
  /** ISO. El modal ordena por acá (FIFO: primero la que entró primero). */
  fechaIngreso: string;
}

/** Cuántas unidades libres tiene cada variante del carrito. */
export type DisponibilidadPorVariante = Record<string, number>;

/**
 * Unidad elegida para una línea del carrito. La clave es la línea del
 * carrito (varianteId), no el producto: dos líneas del mismo producto con
 * distinta variante eligen unidades distintas.
 */
export interface UnidadSeleccionada {
  varianteId: string;
  unidadId: string;
  imei: string;
}

/** IMEI vendido en una línea, para las vistas de trazabilidad. */
export interface UnidadSerieVendida {
  id: string;
  imei: string;
  fechaVenta: string | null;
}
