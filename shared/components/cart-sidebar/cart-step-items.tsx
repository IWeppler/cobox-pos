"use client";

import { CartItemStore } from "@/entities/cart/types";
import { Button } from "@/shared/ui/button";
import { Barcode, ShoppingBag, X } from "lucide-react";
import { CantidadControl } from "./cantidad-control";
import { esFraccionable, formatearCantidad } from "@/shared/lib/unidad-venta";
import {
  ABREVIATURA_UNIDAD,
  normalizarUnidadMedida,
} from "@/shared/lib/fiscal-producto";

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
  continueLabel?: string;
  /** varianteId de las líneas que no se pueden vender sin elegir el aparato. */
  variantesSerializadas?: Set<string>;
  /** IMEI ya elegido por varianteId, para mostrarlo en la línea. */
  imeiPorVariante?: Record<string, string>;
  /** Abre el selector de aparato desde la línea. Sin esto el badge es
   * informativo: en el catálogo público no hay nada que elegir. */
  onElegirUnidad?: () => void;
  /** En los rubros de venta rápida (kiosco, almacén) el ticket va sin
   * miniaturas: son 96px de alto por renglón que se usan mejor mostrando un
   * ítem más. Default true — el catálogo público y el resto de los rubros no
   * cambian. */
  mostrarImagenes?: boolean;
}

export function CartStepItems({
  items,
  onUpdateQuantity,
  onRemoveItem,
  totalCarrito,
  onContinueToPayment,
  continueLabel = "Continuar al Pago",
  variantesSerializadas,
  imeiPorVariante,
  onElegirUnidad,
  mostrarImagenes = true,
}: Readonly<CartStepItemsProps>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="flex-1 overflow-y-auto p-2">
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
                  className="flex gap-3"
                >
                  {mostrarImagenes && (
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
                  )}

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold uppercase tracking-wide text-foreground">
                          {item.nombre}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {item.variante}
                        </p>
                        {/* Producto serializado: hasta que no se elija el
                            aparato, la venta no se puede confirmar. El badge
                            es el acceso al selector — sin esto la vendedora
                            lee "requiere elegir unidad" y no tiene dónde
                            elegirla hasta el paso de pago. */}
                        {item.varianteId &&
                          variantesSerializadas?.has(item.varianteId) && (
                            <button
                              type="button"
                              onClick={onElegirUnidad}
                              disabled={!onElegirUnidad}
                              className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
                                imeiPorVariante?.[item.varianteId]
                                  ? "text-success"
                                  : "text-warning"
                              } ${
                                onElegirUnidad
                                  ? "underline underline-offset-2 hover:opacity-70"
                                  : "cursor-default"
                              }`}
                            >
                              <Barcode className="h-3 w-3 shrink-0" />
                              {imeiPorVariante?.[item.varianteId] ??
                                "Elegir unidad (IMEI)"}
                            </button>
                          )}
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
                      <CantidadControl
                        cantidad={item.cantidad}
                        precio={item.precio}
                        unidadMedida={item.unidadMedida}
                        stockMaximo={item.stockMaximo}
                        onChange={(cantidad) =>
                          onUpdateQuantity(
                            item.productoId,
                            item.variante,
                            cantidad,
                          )
                        }
                      />

                      <div className="text-right">
                        {/* El precio por unidad de medida solo se muestra
                            cuando se vende fraccionado: en una remera "x u."
                            es ruido, en un fiambre es el dato que explica de
                            dónde sale el subtotal. */}
                        {esFraccionable(item.unidadMedida) && (
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {formatearCantidad(
                              item.cantidad,
                              item.unidadMedida,
                            )}{" "}
                            × ${item.precio.toLocaleString("es-AR")}/
                            {ABREVIATURA_UNIDAD[
                              normalizarUnidadMedida(item.unidadMedida)
                            ]}
                          </p>
                        )}
                        <p className="font-mono text-sm font-medium text-foreground">
                          ${lineSubtotal.toLocaleString("es-AR")}
                        </p>
                      </div>
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
            <span className="font-mono text-xl font-medium uppercase text-foreground">
              Subtotal
            </span>
            <span className="font-mono text-xl font-medium text-foreground">
              ${totalCarrito.toLocaleString("es-AR")}
            </span>
          </div>
          <Button
            type="button"
            onClick={onContinueToPayment}
            className="h-12 w-full"
          >
            {continueLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
