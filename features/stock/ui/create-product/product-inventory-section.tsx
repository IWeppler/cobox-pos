import { Package } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ProductInventorySectionProps = {
  showVariants: boolean;
  showInventory: boolean;
  onShowInventoryChange: (show: boolean) => void;
  defaultStock?: number | string;
};

export function ProductInventorySection({
  showVariants,
  showInventory,
  onShowInventoryChange,
  defaultStock = "0",
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
          <div className="pt-3">
            {/* Solo el stock: el código de la variante única vive arriba, al
                lado de la marca, porque identifica al producto y no a su
                inventario. */}
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

          </div>
        </div>
      )}
    </div>
  );
}
