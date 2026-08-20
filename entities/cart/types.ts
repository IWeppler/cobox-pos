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
  /** Precio por UNIDAD DE MEDIDA: por kilo si `unidadMedida` es KG, por pieza
   * si es UNIDAD. El subtotal de la línea es siempre `precio * cantidad`. */
  precio: number;
  cantidad: number;
  /**
   * Unidad en la que se vende el producto (`productos.unidad_medida`). Decide
   * si esta línea acepta cantidad fraccionada (0,750 kg) o solo enteros.
   *
   * Opcional porque no todos los orígenes del carrito conocen el producto
   * completo: una reserva confirmada, por ejemplo, entra con lo que guardó la
   * reserva. Ausente cae a UNIDAD, que es el comportamiento entero de
   * siempre — fail-closed, igual que en el server.
   */
  unidadMedida?: string | null;
  imagenUrl?: string | null;
  stockMaximo: number;
  /** IDs de `reservas` que esta línea del carrito viene a saldar (flujo "Confirmar venta" desde Reservas activas). */
  reservaIds?: string[];
}