"use client";

import { CartItemStore } from "@/entities/cart/types";
import { Button } from "@/shared/ui/button";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";

interface CartStepItemsProps {
  items: CartItemStore[];
  onUpdateQuantity: (
    productoId: string,
    variante: string,
    cantidad: number,
  ) => void;
  onRemoveItem: (productoId: string, variante: string) => void;
  totalCarrito: number;
  onContinueToPayment: () => void;
}

export function CartStepItems({
  items,
  onUpdateQuantity,
  onRemoveItem,
  totalCarrito,
  onContinueToPayment,
}: Readonly<CartStepItemsProps>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <ShoppingBag className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-sm font-medium">Tu carrito esta vacio</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const lineSubtotal = item.precio * item.cantidad;

              return (
                <div
                  key={`${item.productoId}-${item.variante}`}
                  className="flex gap-3 py-3"
                >
                  <div className="h-24 w-18 shrink-0 overflow-hidden border border-border bg-muted/40">
                    {item.imagenUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imagenUrl}
                        alt={item.nombre}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ShoppingBag className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold uppercase tracking-wide text-foreground">
                          {item.nombre}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {item.variante}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onRemoveItem(item.productoId, item.variante)
                        }
                        className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div className="flex h-8 items-center border border-border">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuantity(
                              item.productoId,
                              item.variante,
                              item.cantidad - 1,
                            )
                          }
                          disabled={item.cantidad <= 1}
                          className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-foreground">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuantity(
                              item.productoId,
                              item.variante,
                              item.cantidad + 1,
                            )
                          }
                          disabled={item.cantidad >= item.stockMaximo}
                          className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <p className="text-sm font-bold text-foreground">
                        ${lineSubtotal.toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="shrink-0 border-t border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Subtotal
            </span>
            <span className="text-xl font-bold text-foreground">
              ${totalCarrito.toLocaleString("es-AR")}
            </span>
          </div>
          <Button
            type="button"
            onClick={onContinueToPayment}
            className="h-12 w-full bg-primary text-background hover:bg-primary/90"
          >
            Continuar al Pago
          </Button>
        </div>
      ) : null}
    </div>
  );
}
