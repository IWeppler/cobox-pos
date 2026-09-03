"use client";

import { Button } from "@/shared/ui/button";
import { CartItemStore } from "@/entities/cart/types";
import { CartItemRow } from "@/shared/components/cart-sidebar/cart-item-row";

/**
 * PASO 1: solo los productos.
 *
 * No hay ni un dato del pedido acá, y es el punto de tener dos pasos: mirar lo
 * que uno eligió y decidir si sigue comprando es una cosa, y cargar nombre,
 * dirección y forma de pago es otra. Mezcladas en una sola pantalla, el
 * formulario empuja los productos fuera de la vista justo cuando la clienta
 * quiere revisarlos.
 *
 * NO HAY "VACIAR CARRITO". Cada ítem se quita con su propia X, que es lo mismo
 * pero sin poder equivocarse: un botón que borra todo, al lado del que
 * continúa, en una pantalla que se usa con el pulgar, no tiene ningún caso de
 * uso que lo justifique.
 */
export function CartPasoProductos({
  items,
  subtotal,
  onUpdateQuantity,
  onRemoveItem,
  onSeguirComprando,
  onContinuar,
}: Readonly<{
  items: CartItemStore[];
  subtotal: number;
  onUpdateQuantity: (
    productoId: string,
    variante: string,
    cantidad: number,
  ) => void;
  onRemoveItem: (productoId: string, variante: string) => void;
  onSeguirComprando: () => void;
  onContinuar: () => void;
}>) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="space-y-3">
          {items.map((item) => (
            <CartItemRow
              key={`${item.productoId}-${item.variante}`}
              item={item}
              onUpdateQuantity={(cantidad) =>
                onUpdateQuantity(item.productoId, item.variante, cantidad)
              }
              onRemove={() => onRemoveItem(item.productoId, item.variante)}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 py-4">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            Subtotal
          </span>
          <span className="text-xl font-bold text-foreground">
            ${subtotal.toLocaleString("es-AR")}
          </span>
        </div>

        {/* "Seguir comprando" primero y secundario: es la salida, no la
            acción. Cierra el panel y deja el carrito intacto — el store vive
            afuera de este componente, así que volver a abrirlo lo encuentra
            igual. */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onSeguirComprando}
            className="h-12"
          >
            Seguir comprando
          </Button>
          <Button type="button" onClick={onContinuar} className="h-12">
            Continuar
          </Button>
        </div>
      </div>
    </>
  );
}
