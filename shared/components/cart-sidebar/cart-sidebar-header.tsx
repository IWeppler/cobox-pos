import { ShoppingBag, X } from "lucide-react";

interface CartSidebarHeaderProps {
  isPOSMode: boolean;
  onClose: () => void;
}

export function CartSidebarHeader({
  isPOSMode,
  onClose,
}: Readonly<CartSidebarHeaderProps>) {
  return (
    <div className="shrink-0 flex items-center justify-between p-4 border-b border-border">
      <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
        <ShoppingBag className="w-4 h-4" />
        {isPOSMode ? "Ticket" : "Tu Carrito"}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        aria-label={isPOSMode ? "Cerrar Ticket" : "Cerrar carrito"}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
