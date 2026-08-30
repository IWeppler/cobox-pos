import { Package } from "lucide-react";
import { etiquetaSku } from "@/features/stock/lib/identidad-por-rubro";
import type { Rubro } from "@/entities/config/types";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ProductInventorySectionProps = {
  showVariants: boolean;
  showInventory: boolean;
  onShowInventoryChange: (show: boolean) => void;
  defaultStock?: number | string;
  /** Ofrece el SKU/EAN de la variante única. Apagado por defecto: solo el ALTA
   * lo manda hoy (`crearProductoAction` lo escribe en la variante "Único"). La
   * edición todavía no tiene camino para guardarlo, y un campo que se escribe
   * y no se guarda es peor que no tenerlo. */
  mostrarSku?: boolean;
  /** Solo para el label: en electro esta columna guarda el EAN. */
  rubro?: Rubro;
  defaultSku?: string | null;
};

export function ProductInventorySection({
  showVariants,
  showInventory,
  onShowInventoryChange,
  defaultStock = "0",
  mostrarSku = false,
  rubro,
  defaultSku,
}: ProductInventorySectionProps) {
  if (showVariants) return null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden transition-all">
      <div
        className="flex items-center justify-between p-3 md:p-5 cursor-pointer"
        onClick={() => onShowInventoryChange(true)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted/30 rounded-md border border-border/50">
            <Package className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Inventario</p>
          </div>
        </div>
        {!showInventory && (
          <Button
            type="button"
            variant="ghost"
            className="font-bold text-foreground hover:bg-muted shadow-none h-8 text-sm px-3"
            onClick={(e) => {
              e.stopPropagation();
              onShowInventoryChange(true);
            }}
          >
            + Añadir
          </Button>
        )}
      </div>
      {showInventory && (
        <div className="px-2 md:px-5 pb-5 pt-2 animate-in fade-in slide-in-from-top-2 border-t border-border/50 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Stock Disponible
              </Label>
              <Input
                name="stockBase"
                type="number"
                min="0"
                defaultValue={defaultStock}
                className="h-10 shadow-none rounded-lg"
              />
            </div>

            {mostrarSku && (
              <div className="space-y-2">
                <Label
                  htmlFor="sku"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  {etiquetaSku(rubro)}
                </Label>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={defaultSku ?? ""}
                  placeholder="Opcional"
                  autoComplete="off"
                  className="h-10 shadow-none rounded-lg uppercase"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
