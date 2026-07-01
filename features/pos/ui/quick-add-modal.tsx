"use client";

import { useState, useMemo, useEffect } from "react";
import { Producto } from "@/entities/productos/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { useCartStore } from "@/shared/store/cart-store";
import { toast } from "sonner";
import { Layers } from "lucide-react";

interface QuickAddModalProps {
  producto: Producto | null;
  isOpen: boolean;
  onClose: () => void;
}

export function QuickAddModal({
  producto,
  isOpen,
  onClose,
}: Readonly<QuickAddModalProps>) {
  if (!producto) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <QuickAddModalContent
        key={`${producto.id}-${isOpen ? "open" : "closed"}`}
        producto={producto}
        isOpen={isOpen}
        onClose={onClose}
      />
    </Dialog>
  );
}

function QuickAddModalContent({
  producto,
  isOpen,
  onClose,
}: Readonly<{
  producto: Producto;
  isOpen: boolean;
  onClose: () => void;
}>) {
  const [selecciones, setSelecciones] = useState<Record<string, string>>({});
  const addItem = useCartStore((state) => state.addItem);
  const setIsOpenCart = useCartStore((state) => state.setIsOpen);

  const variantesArray = useMemo(() => {
    const list: Array<{ variante: string; cantidad: number; id_real: string }> =
      [];
    producto.producto_variantes?.forEach((v) =>
      list.push({
        variante: v.nombre_display,
        cantidad: v.stock,
        id_real: v.id,
      }),
    );
    producto.stock?.forEach((s) =>
      list.push({ variante: s.variante, cantidad: s.cantidad, id_real: s.id }),
    );
    return list;
  }, [producto]);

  const parsedVariants = useMemo(() => {
    const props: Record<string, Set<string>> = {};
    let isLegacy = false;
    let isLegacySplit = false;

    variantesArray.forEach((s) => {
      const v = s.variante || "";
      if (v.toLowerCase() === "unico" || v.toLowerCase() === "único") return;

      if (v.includes(":")) {
        v.split("|").forEach((part) => {
          const [key, val] = part.split(":");
          if (key && val) {
            if (!props[key]) props[key] = new Set();
            props[key].add(val.trim());
          }
        });
      } else if (v.includes("/") || v.includes("-")) {
        isLegacySplit = true;
        const separator = v.includes("/") ? "/" : "-";
        v.split(separator).forEach((part, idx) => {
          const key =
            idx === 0 ? "Color" : idx === 1 ? "Talle" : `Opción ${idx + 1}`;
          if (!props[key]) props[key] = new Set();
          props[key].add(part.trim());
        });
      } else {
        isLegacy = true;
        if (!props["Opción"]) props["Opción"] = new Set();
        props["Opción"].add(v.trim());
      }
    });

    const result: Record<string, string[]> = {};
    Object.keys(props).forEach((k) => (result[k] = Array.from(props[k])));
    return { properties: result, isLegacy, isLegacySplit };
  }, [variantesArray]);

  const isOptionAvailable = (propName: string, val: string) => {
    const testSelections = { ...selecciones, [propName]: val };
    return variantesArray.some((s) => {
      if (s.cantidad <= 0) return false;
      const v = s.variante || "";
      if (
        parsedVariants.isLegacySplit &&
        (v.includes("/") || v.includes("-"))
      ) {
        const separator = v.includes("/") ? "/" : "-";
        const parts = v.split(separator).map((p) => p.trim());
        return Object.entries(testSelections).every(([k, selVal]) => {
          const idx =
            k === "Color"
              ? 0
              : k === "Talle"
                ? 1
                : parseInt(k.replace("Opción ", "")) - 1;
          return parts[idx] === selVal;
        });
      }
      if (parsedVariants.isLegacy) return v.trim() === val;
      return Object.entries(testSelections).every(([k, selVal]) =>
        v.split("|").includes(`${k}:${selVal}`),
      );
    });
  };

  useEffect(() => {
    if (!producto || !isOpen) return;

    const dimensionsCount = Object.keys(parsedVariants.properties).length;
    const selectionsCount = Object.keys(selecciones).length;

    if (dimensionsCount > 0 && dimensionsCount === selectionsCount) {
      // Buscar la variante exacta y agregarla
      const stockDeVariante = variantesArray.find((s) => {
        const v = s.variante || "";
        if (
          parsedVariants.isLegacySplit &&
          (v.includes("/") || v.includes("-"))
        ) {
          const separator = v.includes("/") ? "/" : "-";
          const parts = v.split(separator).map((p) => p.trim());
          return Object.entries(selecciones).every(([k, selVal]) => {
            const idx =
              k === "Color"
                ? 0
                : k === "Talle"
                  ? 1
                  : parseInt(k.replace("Opción ", "")) - 1;
            return parts[idx] === selVal;
          });
        }
        if (parsedVariants.isLegacy) return v.trim() === selecciones["Opción"];
        return Object.entries(selecciones).every(([k, selVal]) =>
          v.split("|").includes(`${k}:${selVal}`),
        );
      });

      if (stockDeVariante && stockDeVariante.cantidad > 0) {
        let imagenes: string[] = [];
        if (typeof producto.imagen_url === "string") {
          try {
            imagenes = JSON.parse(producto.imagen_url);
          } catch {
            imagenes = [producto.imagen_url];
          }
        } else if (Array.isArray(producto.imagen_url)) {
          imagenes = producto.imagen_url;
        }

        addItem({
          productoId: producto.id,
          nombre: producto.nombre || "Sin nombre",
          tipo: producto.tipo || "",
          variante: stockDeVariante.variante,
          precio: producto.precio,
          cantidad: 1,
          imagenUrl: imagenes[0] || null,
          stockMaximo: stockDeVariante.cantidad,
        });

        // toast.success("Agregado a la cuenta");
        setIsOpenCart(true); // Abre el carrito lateral
        onClose(); // Cierra el modal rápido
      }
    }
  }, [
    selecciones,
    parsedVariants,
    producto,
    isOpen,
    variantesArray,
    addItem,
    setIsOpenCart,
    onClose,
  ]);

  return (
    <DialogContent aria-describedby="select-variant">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          {producto.nombre}
        </DialogTitle>
        <DialogDescription id="select-variant">
          Selecciona la variante a vender.
        </DialogDescription>
      </DialogHeader>
      <div className="p-5 space-y-6">
        {Object.entries(parsedVariants.properties).map(([propName, values]) => (
          <div key={propName}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
              {propName}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {values.map((val) => {
                const isSelected = selecciones[propName] === val;
                const hasStock = isOptionAvailable(propName, val);

                return (
                  <button
                    key={val}
                    type="button"
                    disabled={!hasStock}
                    onClick={() =>
                      setSelecciones((prev) => ({
                        ...prev,
                        [propName]: val,
                      }))
                    }
                    className={`h-12 rounded-xl text-xs font-bold uppercase transition-all border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20 cursor-pointer scale-[0.98]"
                        : hasStock
                          ? "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted cursor-pointer"
                          : "border-border/30 bg-muted/30 text-muted-foreground opacity-50 cursor-not-allowed line-through decoration-muted-foreground/40"
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DialogContent>
  );
}
