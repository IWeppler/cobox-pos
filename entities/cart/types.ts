export type CartItem = {
  productoId: string;
  nombre: string;
  tipo: string;
  variante: string;
  /** producto_variantes.id real, cuando la variante existe como fila propia. */
  varianteId?: string;
  cantidad: number;
  precioUnitario: number;
};

export interface CartItemStore {
  productoId: string;
  nombre: string;
  tipo: string;
  variante: string;
  /** producto_variantes.id real, cuando la variante existe como fila propia. */
  varianteId?: string;
  precio: number;
  cantidad: number;
  imagenUrl?: string | null;
  stockMaximo: number;
  /** IDs de `reservas` que esta línea del carrito viene a saldar (flujo "Confirmar venta" desde Reservas activas). */
  reservaIds?: string[];
}