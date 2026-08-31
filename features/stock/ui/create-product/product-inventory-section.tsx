"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  ETIQUETA_UNIDAD,
  normalizarUnidadMedida,
  UNIDADES_MEDIDA,
} from "@/shared/lib/fiscal-producto";
import { esFraccionable, pasoCantidad } from "@/shared/lib/unidad-venta";

type ProductInventorySectionProps = {
  showVariants: boolean;
  showInventory: boolean;
  onShowInventoryChange: (show: boolean) => void;
  defaultStock?: number | string;
  /**
   * Cómo se vende el producto: por unidad, por kilo, por metro.
   *
   * Vive ACÁ y no en el bloque fiscal porque no es un dato fiscal: decide
   * cuánto se puede cargar y cuánto se puede vender, que es de lo que habla
   * esta sección. Estaba enterrado en "Datos fiscales" —colapsado y último—,
   * así que dar de alta un producto por kilo exigía saber que había que abrir
   * una sección que dice "fiscal" para algo que no lo es.
   *
   * Es el ÚNICO lugar donde se edita: en el bloque fiscal no está ni
   * escondida. La consecuencia es que un producto CON variantes no la puede
   * cambiar desde el formulario, porque esta sección no se dibuja — y es
   * aceptable: lo que se vende fraccionado (fiambre, verdura) no se maneja
   * por talles. El valor guardado no se toca: las actions miran `has()`, así
   * que un campo que no se muestra tampoco se pisa.
   */
  unidadMedida?: string | null;
};

export function ProductInventorySection({
  showVariants,
  showInventory,
  onShowInventoryChange,
  defaultStock = "0",
  unidadMedida,
}: ProductInventorySectionProps) {
  // La unidad elegida gobierna el campo de stock de al lado: por kilo hay que
  // poder escribir 0,750, y con el `step` en 1 el navegador rechaza el
  // decimal. Antes no se notaba porque la unidad se elegía en otra sección,
  // lejos y después.
  const [unidad, setUnidad] = useState(() =>
    normalizarUnidadMedida(unidadMedida),
  );

  if (showVariants) return null;

  const fraccionable = esFraccionable(unidad);

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
          {/* El código de la variante única vive arriba, al lado de la marca,
              porque identifica al producto y no a su inventario. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Stock Disponible
              </Label>
              <Input
                name="stockBase"
                type="number"
                min="0"
                step={pasoCantidad(unidad)}
                inputMode={fraccionable ? "decimal" : "numeric"}
                defaultValue={defaultStock}
                className="h-10 shadow-none rounded-lg"
              />
              {fraccionable && (
                <p className="text-[10px] text-muted-foreground">
                  Se vende fraccionado: podés cargar 0,750.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Se vende por
              </Label>
              {/* Controlado y no `defaultValue`: el paso del campo de stock
                  depende de este valor, así que el estado tiene que existir
                  igual. Sin él habría que leer el DOM para saberlo. */}
              <Select
                name="unidad_medida"
                value={unidad}
                onValueChange={(valor) =>
                  setUnidad(normalizarUnidadMedida(valor))
                }
              >
                <SelectTrigger className="h-10 shadow-none rounded-lg bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIDADES_MEDIDA.map((u) => (
                    <SelectItem key={u} value={u}>
                      {ETIQUETA_UNIDAD[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
