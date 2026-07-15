"use client";

import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useCartStore } from "@/shared/store/cart-store";

interface ConfirmarVentaReservaButtonProps {
  reservaId: string;
  productoId: string;
  varianteId: string;
  nombreProducto: string;
  varianteNombre: string;
  precio: number | null;
}

// Precarga el carrito del POS con la unidad reservada y navega a /pos — la
// reserva sigue ACTIVA hasta que la venta se confirme ahí (ver registrarVentaAction).
export function ConfirmarVentaReservaButton({
  reservaId,
  productoId,
  varianteId,
  nombreProducto,
  varianteNombre,
  precio,
}: Readonly<ConfirmarVentaReservaButtonProps>) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const setIsOpenCart = useCartStore((state) => state.setIsOpen);

  const handleClick = () => {
    addItem({
      productoId,
      nombre: nombreProducto,
      tipo: "",
      variante: varianteNombre,
      varianteId,
      precio: precio ?? 0,
      cantidad: 1,
      imagenUrl: null,
      stockMaximo: 1,
      reservaIds: [reservaId],
    });
    setIsOpenCart(true);
    router.push("/pos");
  };

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleClick}
      className="h-10"
    >
      <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
      Confirmar venta
    </Button>
  );
}
