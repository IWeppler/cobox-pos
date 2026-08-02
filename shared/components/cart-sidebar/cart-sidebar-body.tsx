"use client";

import { useState } from "react";
import { CartItemStore } from "@/entities/cart/types";
import { CreateSalePaymentInput } from "@/entities/ventas/types";
import { MetodoPagoPOS, PromocionDB } from "./types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  X,
  Split,
  Banknote,
  Smartphone,
  Wallet,
  CreditCard,
} from "lucide-react";

interface CartSidebarBodyProps {
  items: CartItemStore[];
  isPOSMode: boolean;
  isPending: boolean;
  metodosPagoDB: MetodoPagoPOS[];
  pagos: CreateSalePaymentInput[];
  onPagosChange: (pagos: CreateSalePaymentInput[]) => void;
  totalFinal: number;
  promocionesElegibles: PromocionDB[];
  promocionActivaId: string;
  onContinueShopping: () => void;
  onRemoveItem: (productoId: string, variante: string) => void;
  onUpdateQuantity: (
    productoId: string,
    variante: string,
    cantidad: number,
  ) => void;
  onPromocionChange: (promocionId: string) => void;
}

export function CartSidebarBody({
  items,
  isPOSMode,
  isPending,
  metodosPagoDB,
  pagos,
  onPagosChange,
  totalFinal,
  promocionesElegibles,
  promocionActivaId,
  onContinueShopping,
  onRemoveItem,
  onUpdateQuantity,
  onPromocionChange,
}: Readonly<CartSidebarBodyProps>) {
  const [modoMixto, setModoMixto] = useState(false);

  // Cálculos para el modo mixto
  const sumaPagos = pagos.reduce(
    (acc, p) => acc + Number(p.montoAsignado || 0),
    0,
  );
  const diferencia = totalFinal - sumaPagos;

  // --- HANDLERS MODO RÁPIDO ---
  const handleSelectPagoRapido = (metodoId: string) => {
    onPagosChange([{ metodoPagoId: metodoId, montoAsignado: totalFinal }]);
  };

  // --- HANDLERS MODO MIXTO ---
  const handleHabilitarModoMixto = () => {
    setModoMixto(true);
    // Si no hay pagos, asignamos el primero por defecto con el total
    if (pagos.length === 0 && metodosPagoDB.length > 0) {
      onPagosChange([
        { metodoPagoId: metodosPagoDB[0].id, montoAsignado: totalFinal },
      ]);
    }
  };

  const handleDeshabilitarModoMixto = () => {
    setModoMixto(false);
    // Al volver al modo rápido, nos quedamos solo con el primer método (o el seleccionado) y le asignamos el 100%
    if (pagos.length > 0 && metodosPagoDB.length > 0) {
      onPagosChange([
        { metodoPagoId: pagos[0].metodoPagoId, montoAsignado: totalFinal },
      ]);
    } else if (metodosPagoDB.length > 0) {
      onPagosChange([
        { metodoPagoId: metodosPagoDB[0].id, montoAsignado: totalFinal },
      ]);
    }
  };

  const handleAddPago = () => {
    if (metodosPagoDB.length === 0) return;
    onPagosChange([
      ...pagos,
      {
        metodoPagoId: metodosPagoDB[0].id,
        montoAsignado: diferencia > 0 ? diferencia : 0,
      },
    ]);
  };

  const handleUpdatePago = (
    index: number,
    field: string,
    value: string | number,
  ) => {
    const newPagos = [...pagos];
    newPagos[index] = { ...newPagos[index], [field]: value };
    onPagosChange(newPagos);
  };

  const handleRemovePago = (index: number) => {
    const newPagos = pagos.filter((_, i) => i !== index);
    if (newPagos.length === 1) {
      // Si queda un solo pago, le asignamos todo el monto para facilitar la vida al cajero
      newPagos[0].montoAsignado = totalFinal;
    }
    onPagosChange(newPagos);
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {items.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center p-5 text-muted-foreground/70 space-y-4">
          <ShoppingBag className="w-16 h-16" strokeWidth={1} />
          <p className="text-sm uppercase font-medium text-center">
            {isPOSMode
              ? "No hay productos en la venta"
              : "El carrito está vacío"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col flex-1">
          {/* LISTA DE PRODUCTOS */}
          <div className="p-5 space-y-6">
            {items.map((item) => (
              <div
                key={`${item.productoId}-${item.variante}`}
                className="flex gap-4 relative group"
              >
                <button
                  onClick={() => onRemoveItem(item.productoId, item.variante)}
                  className="absolute -left-2 -top-2 w-6 h-6 bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-colors z-10 opacity-0 group-hover:opacity-100 cursor-pointer rounded-full"
                  title="Eliminar producto"
                >
                  <X className="w-3 h-3" />
                </button>

                <div className="w-20 h-24 bg-muted/30 rounded-md border border-border/50 shrink-0 flex items-center justify-center overflow-hidden">
                  {item.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imagenUrl}
                      alt={item.nombre}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <ShoppingBag className="w-6 h-6 text-muted-foreground/30" />
                  )}
                </div>

                <div className="flex flex-col flex-1 justify-between py-1">
                  <div>
                    <h3 className="font-bold text-sm uppercase tracking-wide leading-tight line-clamp-2">
                      {item.nombre}
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                      {item.tipo} • Talle {item.variante}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center border border-border rounded-md overflow-hidden h-8">
                      <button
                        onClick={() =>
                          onUpdateQuantity(
                            item.productoId,
                            item.variante,
                            item.cantidad - 1,
                          )
                        }
                        className="w-8 h-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                        disabled={item.cantidad <= 1 || isPending}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-semibold">
                        {item.cantidad}
                      </span>
                      <button
                        onClick={() =>
                          onUpdateQuantity(
                            item.productoId,
                            item.variante,
                            item.cantidad + 1,
                          )
                        }
                        className="w-8 h-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                        disabled={isPending}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="font-bold text-sm">
                      ${(item.precio * item.cantidad).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ÁREA DE PAGOS Y DESCUENTOS (Solo en Modo POS) */}
          {isPOSMode && (
            <div className="mt-auto p-5 border-t border-border/50 bg-muted/10 space-y-6">
              {/* --- SECCIÓN MÉTODOS DE PAGO --- */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    Método de Pago
                  </p>
                  {metodosPagoDB.length > 1 && (
                    <button
                      type="button"
                      onClick={
                        modoMixto
                          ? handleDeshabilitarModoMixto
                          : handleHabilitarModoMixto
                      }
                      className="text-xs font-bold text-primary flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      {modoMixto ? (
                        "Cancelar división"
                      ) : (
                        <>
                          <Split className="w-3 h-3" /> Dividir pago
                        </>
                      )}
                    </button>
                  )}
                </div>

                {metodosPagoDB.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic text-center">
                    Cargando métodos de pago...
                  </div>
                ) : !modoMixto ? (
                  // --- MODO RÁPIDO (Botones simples) ---
                  <div className="grid grid-cols-2 p-1 bg-muted/50 rounded-xl gap-1">
                    {metodosPagoDB.map((metodo) => {
                      let Icon = Banknote;
                      if (metodo.tipo === "TRANSFERENCIA") Icon = Smartphone;
                      if (metodo.tipo === "BILLETERA_VIRTUAL") Icon = Wallet;
                      if (metodo.tipo === "TARJETA") Icon = CreditCard;

                      const isSelected =
                        pagos.length > 0 && pagos[0].metodoPagoId === metodo.id;

                      let selectedClass =
                        "text-muted-foreground hover:text-foreground cursor-pointer";
                      if (isSelected) {
                        if (metodo.tipo === "EFECTIVO")
                          selectedClass =
                            "bg-background text-chart-4 ring-1 ring-black/5 dark:ring-white/10";
                        else if (metodo.tipo === "TRANSFERENCIA")
                          selectedClass =
                            "bg-background text-chart-1 ring-1 ring-black/5 dark:ring-white/10";
                        else if (metodo.tipo === "BILLETERA_VIRTUAL")
                          selectedClass =
                            "bg-background text-chart-3 ring-1 ring-black/5 dark:ring-white/10";
                        else if (metodo.tipo === "TARJETA")
                          selectedClass =
                            "bg-background text-chart-2 ring-1 ring-black/5 dark:ring-white/10";
                        else
                          selectedClass =
                            "bg-background text-foreground ring-1 ring-black/5 dark:ring-white/10";
                      }

                      return (
                        <button
                          key={metodo.id}
                          onClick={() => handleSelectPagoRapido(metodo.id)}
                          className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${selectedClass}`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="truncate w-full px-1">
                            {metodo.nombre}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // --- MODO MIXTO (Inputs complejos) ---
                  <div className="space-y-3 animate-in fade-in-50">
                    {pagos.map((pago, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Select
                          value={pago.metodoPagoId}
                          onValueChange={(val) =>
                            handleUpdatePago(idx, "metodoPagoId", val)
                          }
                        >
                          <SelectTrigger className="w-[140px] bg-background shadow-none border-border h-10">
                            <SelectValue placeholder="Método..." />
                          </SelectTrigger>
                          <SelectContent>
                            {metodosPagoDB.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                            $
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            // Truco visual para que no aparezca un cero molesto al crear uno nuevo
                            value={
                              pago.montoAsignado === 0 &&
                              idx === pagos.length - 1
                                ? ""
                                : pago.montoAsignado
                            }
                            onChange={(e) =>
                              handleUpdatePago(
                                idx,
                                "montoAsignado",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="pl-7 h-10 bg-background shadow-none border-border font-bold text-foreground"
                          />
                        </div>

                        {pagos.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePago(idx)}
                            className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}

                    {/* ALERTA VISUAL SI NO CUADRAN LOS NÚMEROS */}
                    {Math.abs(diferencia) > 0.05 && (
                      <div
                        className={`text-[11px] font-bold uppercase tracking-wider p-2 rounded-lg ${
                          diferencia > 0
                            ? "bg-warning/10 text-warning border border-warning/20"
                            : "bg-danger/10 text-danger border border-danger/20"
                        }`}
                      >
                        {diferencia > 0
                          ? `Falta asignar: $${diferencia.toLocaleString("es-AR")}`
                          : `Sobra: $${Math.abs(diferencia).toLocaleString("es-AR")}`}
                      </div>
                    )}

                    {/* BOTÓN + PARA DIVIDIR PAGO (Aparece si falta saldo) */}
                    {diferencia > 0.05 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddPago}
                        className="w-full border-dashed border-border text-muted-foreground hover:text-foreground shadow-none cursor-pointer"
                      >
                        <Plus className="w-4 h-4 mr-1.5" /> Agregar otro método
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* --- SECCIÓN DESCUENTOS --- */}
              <div className="pt-4 border-t border-border/50">
                <div className="flex items-center gap-2 mb-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  <Tag className="w-3.5 h-3.5" /> Descuentos
                </div>

                {promocionesElegibles.length > 0 ? (
                  <Select
                    value={promocionActivaId || "ninguna"}
                    onValueChange={onPromocionChange}
                  >
                    <SelectTrigger className="w-full text-sm bg-background border-border shadow-none h-10">
                      <SelectValue placeholder="Aplicar descuento..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="ninguna"
                        className="text-muted-foreground italic"
                      >
                        No aplicar descuento
                      </SelectItem>
                      {promocionesElegibles.map((promo) => (
                        <SelectItem
                          key={promo.id}
                          value={promo.id}
                          className="font-medium"
                        >
                          {promo.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-full text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-md border border-border/50 flex items-center justify-center italic">
                    No hay descuentos aplicables a este carrito.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
