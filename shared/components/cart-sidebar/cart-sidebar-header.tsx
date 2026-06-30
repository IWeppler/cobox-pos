import { ShoppingBag } from "lucide-react";

interface CartSidebarHeaderProps {
  isPOSMode: boolean;
  onClose: () => void;
}

export function CartSidebarHeader({
  isPOSMode,
}: Readonly<CartSidebarHeaderProps>) {
  return (
    <div className="shrink-0 flex items-center justify-between p-4 border-b border-border">
      <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
        <ShoppingBag className="w-4 h-4" />
        {isPOSMode ? "Venta en Curso" : "Tu Carrito"}
      </h2>
    </div>
  );
}
