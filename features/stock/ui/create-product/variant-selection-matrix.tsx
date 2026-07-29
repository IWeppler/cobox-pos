import { memo } from "react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { buildVariantKey } from "../../utils/parse-legacy-variant";
import type { BaseVariant, Opcion } from "@/features/stock/types";

type VariantSelectionMatrixProps = {
  opciones: Opcion[];
  baseVariants: BaseVariant[];
  selectedCombinations: Record<string, boolean>;
  onToggleCombination: (key: string) => void;
  onBulkSetSelection: (keys: string[], value: boolean) => void;
  onInvertSelection: (keys: string[]) => void;
  pivotSelections: Record<string, string>;
  onPivotChange: (propName: string, value: string) => void;
};

const SIN_SEGUNDA_PROPIEDAD = "__sin_segunda_propiedad__";

export const VariantSelectionMatrix = memo(function VariantSelectionMatrix({
  opciones,
  baseVariants,
  selectedCombinations,
  onToggleCombination,
  onBulkSetSelection,
  onInvertSelection,
  pivotSelections,
  onPivotChange,
}: VariantSelectionMatrixProps) {
  const opcionesValidas = opciones.filter(
    (o) => o.nombre.trim() && o.valores.length > 0,
  );

  if (opcionesValidas.length === 0) return null;

  const yProp = opcionesValidas[0];
  const xProp = opcionesValidas[1];
  const pivots = opcionesValidas.slice(2);
  const xValues = xProp ? xProp.valores : [SIN_SEGUNDA_PROPIEDAD];
  const validKeys = new Set(baseVariants.map((b) => b.key));

  // buildVariantKey usa opcion.nombre como clave de un Record: si el eje Y,
  // el eje X o algún pivot terminan con el mismo nombre (ej. a mitad de
  // renombrar una propiedad para que coincida con otra), las claves pueden
  // colisionar. El warning de nombres duplicados (arriba, en la edición de
  // propiedades) ya cubre y bloquea el guardado en ese caso.
  const buildCellKey = (yVal: string, xVal: string | null) => {
    const values: Record<string, string> = { [yProp.nombre]: yVal };
    if (xProp && xVal !== null) values[xProp.nombre] = xVal;
    for (const pivot of pivots) {
      values[pivot.nombre] = pivotSelections[pivot.nombre] ?? pivot.valores[0];
    }
    return buildVariantKey(values);
  };

  const isChecked = (key: string) =>
    selectedCombinations[key] ?? opcionesValidas.length === 1;

  const visibleKeys = yProp.valores.flatMap((yVal) =>
    xValues.map((xVal) => buildCellKey(yVal, xProp ? xVal : null)),
  );

  return (
    <div className="space-y-3 p-4 border border-border rounded-xl bg-card">
      {pivots.length > 0 && (
        <div className="space-y-3 pb-3 border-b border-border/50">
          {pivots.map((pivot) => (
            <div key={pivot.id}>
              <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                {pivot.nombre}
              </Label>
              <Tabs
                value={pivotSelections[pivot.nombre] ?? pivot.valores[0]}
                onValueChange={(val) => onPivotChange(pivot.nombre, val)}
              >
                <TabsList>
                  {pivot.valores.map((val) => (
                    <TabsTrigger key={val} value={val}>
                      {pivot.nombre}: {val}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-muted-foreground">
          Marcá las combinaciones
        </Label>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => onBulkSetSelection(visibleKeys, true)}
          >
            Seleccionar todas
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => onInvertSelection(visibleKeys)}
          >
            Invertir selección
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="text-sm text-left w-full">
          <thead className="bg-sidebar text-muted-foreground text-[10px] uppercase font-bold tracking-widest border-b border-border">
            <tr>
              <th className="px-3 py-2 whitespace-nowrap">{yProp.nombre}</th>
              {xProp ? (
                xProp.valores.map((xVal) => (
                  <th key={xVal} className="px-3 py-2 text-center">
                    {xVal}
                  </th>
                ))
              ) : (
                <th className="px-3 py-2 text-center" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {yProp.valores.map((yVal) => (
              <tr key={yVal}>
                <th className="px-3 py-2 font-semibold text-foreground text-left whitespace-nowrap">
                  {yVal}
                </th>
                {xValues.map((xVal) => {
                  const key = buildCellKey(yVal, xProp ? xVal : null);
                  if (!validKeys.has(key)) {
                    return <td key={xVal} className="px-3 py-2" />;
                  }

                  return (
                    <td key={xVal} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked(key)}
                        onChange={() => onToggleCombination(key)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
