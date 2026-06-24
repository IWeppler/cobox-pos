import { DollarSign } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ProductPriceSectionProps = {
  showPrice: boolean;
  onShowPriceChange: (show: boolean) => void;
  precioCosto: string;
  onPrecioCostoChange: (value: string) => void;
  precioVenta: string;
  onPrecioVentaChange: (value: string) => void;
  gananciaNeta: number;
  margenPorcentaje: string;
};

export function ProductPriceSection({
  showPrice,
  onShowPriceChange,
  precioCosto,
  onPrecioCostoChange,
  precioVenta,
  onPrecioVentaChange,
  gananciaNeta,
  margenPorcentaje,
}: ProductPriceSectionProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between p-3 md:p-5 cursor-pointer"
        onClick={() => onShowPriceChange(true)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted/30 rounded-md border border-border/50">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Precios</p>
            {precioVenta && (
              <p className="text-xs text-muted-foreground mt-0.5">
                ${parseFloat(precioVenta).toLocaleString("es-AR")}
              </p>
            )}
          </div>
        </div>
        {!showPrice && (
          <Button
            type="button"
            variant="ghost"
            className="font-bold text-foreground hover:bg-muted shadow-none h-8 text-sm px-3"
            onClick={(e) => {
              e.stopPropagation();
              onShowPriceChange(true);
            }}
          >
            + Añadir
          </Button>
        )}
      </div>

      {showPrice && (
        <div className="px-2 md:px-5 pb-5 pt-2 animate-in fade-in slide-in-from-top-2 border-t border-border/50 mt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Costo
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  name="precio_costo"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={precioCosto}
                  onChange={(e) => onPrecioCostoChange(e.target.value)}
                  className="h-10 pl-7 bg-sidebar rounded-lg"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Precio Venta
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  name="precio"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={precioVenta}
                  onChange={(e) => onPrecioVentaChange(e.target.value)}
                  className="h-10 pl-7 shadow-none rounded-lg bg-sidebar"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Ganancia Neta
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  readOnly
                  disabled
                  value={gananciaNeta > 0 ? gananciaNeta : ""}
                  placeholder="0.00"
                  className="h-10 pl-7 shadow-none rounded-lg bg-muted/30 cursor-not-allowed font-medium text-emerald-600"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Margen
              </Label>
              <div className="relative">
                <Input
                  readOnly
                  disabled
                  value={margenPorcentaje !== "0" ? margenPorcentaje : ""}
                  placeholder="0.0"
                  className="h-10 pr-7 shadow-none rounded-lg bg-muted/30 cursor-not-allowed font-medium text-emerald-600"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
