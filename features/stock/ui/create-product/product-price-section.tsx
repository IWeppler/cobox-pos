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
  recargoPorcentaje: string;
  /**
   * Las variantes que tienen precio PROPIO, y que por lo tanto no se van a
   * enterar de lo que se escriba en "Precio Venta".
   *
   * Sin esto, el campo de arriba es una trampa: la dueña corrige el precio
   * donde lo lee —el del producto— se va convencida de que lo arregló, y la
   * caja sigue cobrando el de la variante. Es lo que pasó con "Pantalon
   * sastrero HHP" el 8/9/2026. Opcional: en el alta no hay nada que avisar.
   */
  variantesConPrecioPropio?: { nombre: string; precio: number }[];
  /**
   * Deja a todas las variantes sin precio propio, o sea heredando el de
   * arriba. Es la acción que la dueña quería y no existía: hasta hoy había que
   * ir fila por fila en la tabla de variantes, que es justo donde no mira.
   */
  onUsarPrecioEnTodas?: () => void;
  /**
   * Vuelve atrás lo anterior. `undefined` = no hay nada que deshacer. Existe
   * porque sin esto, un click de más obliga a retipear precio por precio.
   */
  onDeshacerPrecioEnTodas?: () => void;
};

export function ProductPriceSection({
  showPrice,
  onShowPriceChange,
  precioCosto,
  onPrecioCostoChange,
  precioVenta,
  onPrecioVentaChange,
  gananciaNeta,
  recargoPorcentaje,
  variantesConPrecioPropio = [],
  onUsarPrecioEnTodas,
  onDeshacerPrecioEnTodas,
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
                  className="h-10 pl-7 shadow-none rounded-lg bg-muted/30 cursor-not-allowed font-medium text-success"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Recargo
              </Label>
              <div className="relative">
                <Input
                  readOnly
                  disabled
                  value={recargoPorcentaje !== "0" ? recargoPorcentaje : ""}
                  placeholder="0.0"
                  className="h-10 pr-7 shadow-none rounded-lg bg-muted/30 cursor-not-allowed font-medium text-success"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Lo que "Precio Venta" NO va a cambiar. Va pegado al campo y no en
              un banner arriba: el aviso sirve en el momento exacto en que la
              persona está escribiendo el número que cree que arregla todo. */}
          {variantesConPrecioPropio.length > 0 && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs font-semibold text-warning">
                {variantesConPrecioPropio.length === 1
                  ? "1 variante tiene su propio precio y no va a cambiar"
                  : `${variantesConPrecioPropio.length} variantes tienen su propio precio y no van a cambiar`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Lo que se cobra en la caja es el precio de la variante. Podés
                dejarlas a todas con el precio de arriba, o editarlas una por
                una en la tabla de variantes de más abajo.
              </p>
              {onUsarPrecioEnTodas && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 h-8 text-xs font-semibold border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                  onClick={onUsarPrecioEnTodas}
                >
                  Usar{" "}
                  {precioVenta
                    ? `$${parseFloat(precioVenta).toLocaleString("es-AR")}`
                    : "este precio"}{" "}
                  en todas
                </Button>
              )}
              <ul className="mt-2 space-y-0.5">
                {variantesConPrecioPropio.slice(0, 6).map((v) => (
                  <li
                    key={v.nombre}
                    className="text-[11px] text-muted-foreground flex justify-between gap-3"
                  >
                    <span className="truncate">{v.nombre}</span>
                    <span className="font-mono tabular-nums shrink-0">
                      ${v.precio.toLocaleString("es-AR")}
                    </span>
                  </li>
                ))}
                {variantesConPrecioPropio.length > 6 && (
                  <li className="text-[11px] text-muted-foreground italic">
                    y {variantesConPrecioPropio.length - 6} más
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Después de aplicar, el bloque de arriba desaparece solo (ya no
              quedan variantes con precio propio), así que el "Deshacer" tiene
              que vivir en su propio bloque. Sigue disponible hasta guardar:
              nada de esto tocó la base todavía. */}
          {onDeshacerPrecioEnTodas && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 flex items-start justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Las variantes van a usar el precio del producto. Se aplica al
                guardar.
              </p>
              <Button
                type="button"
                variant="ghost"
                className="h-7 text-xs font-semibold shrink-0 px-2"
                onClick={onDeshacerPrecioEnTodas}
              >
                Deshacer
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
