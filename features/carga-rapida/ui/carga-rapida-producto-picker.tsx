"use client";

import { Producto } from "@/entities/productos/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Search } from "lucide-react";

interface CargaRapidaProductoPickerProps {
  candidatos: Producto[] | null;
  onCancelar: () => void;
  onSeleccionar: (producto: Producto) => void;
}

export function CargaRapidaProductoPicker({
  candidatos,
  onCancelar,
  onSeleccionar,
}: Readonly<CargaRapidaProductoPickerProps>) {
  const isOpen = candidatos !== null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancelar()}>
      {isOpen ? (
        <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-card border-border">
          <DialogHeader className="p-5 pb-3 border-b border-border bg-muted/20">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Search className="w-5 h-5 text-primary" />
              Varios productos coinciden
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Elegí el producto correcto.
            </p>
          </DialogHeader>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {candidatos?.map((producto) => (
              <button
                key={producto.id}
                type="button"
                onClick={() => onSeleccionar(producto)}
                className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <span className="text-sm font-medium text-foreground">
                  {producto.nombre}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 ml-3">
                  {producto.producto_variantes?.length ?? 0} variante
                  {(producto.producto_variantes?.length ?? 0) === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
