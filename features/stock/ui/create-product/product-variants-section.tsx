import {
  memo,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
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
import { PREDEFINED_VARIANTS } from "../../types/constants";
import type {
  BaseVariant,
  Opcion,
  VarianteInput,
  VariantDataState,
} from "@/features/stock/types";
import type { SugerenciaValorAtributo } from "@/features/stock/actions/get-attribute-suggestions";
import { slugify } from "@/shared/utils/slugify";
import { VariantSelectionMatrix } from "./variant-selection-matrix";

type ProductVariantsSectionProps = {
  showVariants: boolean;
  onShowVariantsChange: (show: boolean) => void;
  opciones: Opcion[];
  resetOpciones: () => void;
  customTypeMode: Record<string, boolean>;
  setCustomTypeMode: Dispatch<SetStateAction<Record<string, boolean>>>;
  focusedOptionId: string | null;
  setFocusedOptionId: (id: string | null) => void;
  precioVenta: string;
  variantes: VarianteInput[];
  duplicatePropertyNames: Set<string>;
  genericPropertyNames: Set<string>;
  handleAddOption: () => void;
  handleRemoveOption: (id: string) => void;
  handleUpdateOptionName: (id: string, newName: string) => void;
  handleAddOptionValue: (id: string, value: string) => void;
  handleRemoveOptionValue: (id: string, valueToRemove: string) => void;
  handleVarChange: (
    key: string,
    field: keyof VariantDataState,
    value: string,
  ) => void;
  ensureSuggestionsLoaded: (nombre: string) => void;
  isLoadingSuggestions: (nombre: string) => boolean;
  getFilteredSuggestions: (
    nombre: string,
    query: string,
    currentValues: string[],
  ) => SugerenciaValorAtributo[];
  showAdvancedColumns?: boolean;
  baseVariants?: BaseVariant[];
  selectedCombinations?: Record<string, boolean>;
  onToggleCombination?: (key: string) => void;
  onBulkSetSelection?: (keys: string[], value: boolean) => void;
  onInvertSelection?: (keys: string[]) => void;
  pivotSelections?: Record<string, string>;
  onPivotChange?: (propName: string, value: string) => void;
  /** Nombres de propiedad ya usados en otros productos del catálogo (p.ej.
   * "Género"), ofrecidos en el dropdown además de PREDEFINED_VARIANTS. */
  atributosExistentes?: string[];
};

export const ProductVariantsSection = memo(function ProductVariantsSection({
  showVariants,
  onShowVariantsChange,
  opciones,
  resetOpciones,
  customTypeMode,
  setCustomTypeMode,
  focusedOptionId,
  setFocusedOptionId,
  precioVenta,
  variantes,
  duplicatePropertyNames,
  genericPropertyNames,
  handleAddOption,
  handleRemoveOption,
  handleUpdateOptionName,
  handleAddOptionValue,
  handleRemoveOptionValue,
  handleVarChange,
  ensureSuggestionsLoaded,
  isLoadingSuggestions,
  getFilteredSuggestions,
  showAdvancedColumns = false,
  baseVariants,
  selectedCombinations,
  onToggleCombination,
  onBulkSetSelection,
  onInvertSelection,
  pivotSelections,
  onPivotChange,
  atributosExistentes = [],
}: ProductVariantsSectionProps) {
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Preestablecidas primero, después las ya usadas en el catálogo que no
  // sean ya una preestablecida (case-insensitive, evita duplicar "Talle"
  // si ya está en atributos con ese casing exacto).
  const opcionesPropiedad = useMemo(() => {
    const predefinidasLower = new Set(
      PREDEFINED_VARIANTS.map((v) => v.toLowerCase()),
    );
    const existentesSinDuplicar = atributosExistentes.filter(
      (nombre) => !predefinidasLower.has(nombre.toLowerCase()),
    );
    return [...PREDEFINED_VARIANTS, ...existentesSinDuplicar];
  }, [atributosExistentes]);

  const matrixProps =
    baseVariants &&
    selectedCombinations &&
    onToggleCombination &&
    onBulkSetSelection &&
    onInvertSelection &&
    pivotSelections &&
    onPivotChange
      ? {
          baseVariants,
          selectedCombinations,
          onToggleCombination,
          onBulkSetSelection,
          onInvertSelection,
          pivotSelections,
          onPivotChange,
        }
      : null;

  const showMatrix =
    matrixProps !== null &&
    matrixProps.baseVariants.length > 0 &&
    opciones.some((o) => o.nombre.trim() && o.valores.length > 0);

  return (
    <div className="bg-card">
      <div
        className="flex items-center justify-between py-2 cursor-pointer"
        onClick={() => onShowVariantsChange(true)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted/30 rounded-md border border-border/50">
            <Layers className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Variantes</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Talles, colores, materiales...
            </p>
          </div>
        </div>
        {!showVariants && (
          <Button
            type="button"
            variant="ghost"
            className="font-bold text-foreground hover:bg-muted shadow-none h-8 text-sm px-3"
            onClick={(e) => {
              e.stopPropagation();
              onShowVariantsChange(true);
            }}
          >
            + Añadir variante
          </Button>
        )}
        {showVariants && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onShowVariantsChange(false);
              resetOpciones();
            }}
          >
            Quitar
          </Button>
        )}
      </div>

      {showVariants && (
        <div className="px-2 pb-4 animate-in fade-in slide-in-from-top-4 space-y-6 border-t border-border/50 pt-5 mt-2">
          <div className="space-y-4">
            {opciones.map((op) => {
              const isCustom = customTypeMode[op.id];
              const inputValue = inputValues[op.id] ?? "";
              const filteredSuggestions = getFilteredSuggestions(
                op.nombre,
                inputValue,
                op.valores,
              );
              const queryTrimmed = inputValue.trim();
              const hasExactMatch = filteredSuggestions.some(
                (s) => slugify(s.valor) === slugify(queryTrimmed),
              );
              const showCrearNuevo = queryTrimmed !== "" && !hasExactMatch;
              const loadingSuggestions = isLoadingSuggestions(op.nombre);
              const showDropdown =
                focusedOptionId === op.id && op.nombre.trim() !== "";

              const agregarValor = (valor: string) => {
                handleAddOptionValue(op.id, valor);
                setInputValues((prev) => ({ ...prev, [op.id]: "" }));
              };

              const normalizedNombre = op.nombre.trim().toLowerCase();
              const isDuplicateName =
                normalizedNombre !== "" &&
                duplicatePropertyNames.has(normalizedNombre);
              const isGenericName =
                normalizedNombre !== "" &&
                genericPropertyNames.has(normalizedNombre);
              const hasNameError = isDuplicateName || isGenericName;

              return (
                <div
                  key={op.id}
                  className="p-4 border border-border rounded-xl bg-s relative"
                >
                  {!op.bloqueado && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveOption(op.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}

                  <div className="space-y-4 pr-8">
                    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                          Propiedad
                          {op.bloqueado && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/30"
                            >
                              Requerido por la categoría
                            </Badge>
                          )}
                        </Label>
                        {isCustom ? (
                          <Input
                            placeholder="Ej: Material"
                            value={op.nombre}
                            onChange={(e) =>
                              handleUpdateOptionName(op.id, e.target.value)
                            }
                            disabled={op.bloqueado}
                            className={`h-10 shadow-none bg-card ${
                              hasNameError
                                ? "border-destructive focus-visible:ring-destructive"
                                : ""
                            }`}
                            autoFocus
                          />
                        ) : (
                          <Select
                            value={
                              opcionesPropiedad.includes(op.nombre)
                                ? op.nombre
                                : ""
                            }
                            disabled={op.bloqueado}
                            onValueChange={(val) => {
                              if (val === "custom") {
                                setCustomTypeMode((prev) => ({
                                  ...prev,
                                  [op.id]: true,
                                }));
                                handleUpdateOptionName(op.id, "");
                              } else {
                                handleUpdateOptionName(op.id, val);
                              }
                            }}
                          >
                            <SelectTrigger
                              className={`h-10 shadow-none bg-card ${
                                hasNameError
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : ""
                              }`}
                            >
                              <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                              {opcionesPropiedad.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                              <div className="h-px bg-border my-1" />
                              <SelectItem
                                value="custom"
                                className="text-primary font-semibold"
                              >
                                + Crear nueva propiedad
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {isDuplicateName && (
                          <p className="text-xs text-destructive">
                            Ya existe una propiedad con este nombre
                          </p>
                        )}
                        {isGenericName && (
                          <p className="text-xs text-destructive">
                            Este es un nombre genérico auto-generado.
                            Renombralo (ej. &quot;Color&quot;, &quot;Talle&quot;,
                            &quot;Material&quot;).
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Valores
                        </Label>
                        <div className="flex flex-wrap items-center gap-2 p-1 min-h-10 bg-card border border-border rounded-lg shadow-none focus-within:ring-1 focus-within:ring-primary/20 relative">
                          {op.valores.map((val) => (
                            <Badge
                              key={val}
                              variant="secondary"
                              className="flex items-center gap-1 font-medium text-sm bg-muted py-1 px-2.5 rounded-md"
                            >
                              {val}
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveOptionValue(op.id, val)
                                }
                                className="hover:text-destructive ml-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}

                          <div className="relative flex-1 min-w-30">
                            <input
                              type="text"
                              value={inputValue}
                              placeholder={
                                op.valores.length === 0
                                  ? "Ej: S, M, L..."
                                  : "Agregar otro..."
                              }
                              onChange={(e) =>
                                setInputValues((prev) => ({
                                  ...prev,
                                  [op.id]: e.target.value,
                                }))
                              }
                              onFocus={() => {
                                setFocusedOptionId(op.id);
                                ensureSuggestionsLoaded(op.nombre);
                              }}
                              onBlur={() => setFocusedOptionId(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  agregarValor(e.currentTarget.value);
                                }
                              }}
                              className="w-full bg-transparent border-none outline-none text-sm px-2 h-8 placeholder:text-muted-foreground/50"
                            />

                            {showDropdown && (
                              <div className="absolute top-full left-0 mt-2 max-h-56 w-56 overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-60 p-1 flex flex-col gap-0.5">
                                {loadingSuggestions ? (
                                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                                    Cargando sugerencias...
                                  </p>
                                ) : (
                                  <>
                                    {filteredSuggestions.length > 0 ? (
                                      filteredSuggestions.map((sugg) => (
                                        <button
                                          key={sugg.valor}
                                          type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            agregarValor(sugg.valor);
                                          }}
                                          className="w-full flex items-baseline justify-between gap-2 text-left px-2.5 py-1.5 text-sm hover:bg-muted rounded-md transition-colors"
                                        >
                                          <span className="truncate">
                                            {sugg.valor}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground shrink-0">
                                            {sugg.productos} producto
                                            {sugg.productos === 1 ? "" : "s"}
                                          </span>
                                        </button>
                                      ))
                                    ) : (
                                      <p className="px-2.5 py-2 text-xs text-muted-foreground">
                                        No hay sugerencias
                                      </p>
                                    )}
                                    {showCrearNuevo && (
                                      <>
                                        <div className="h-px bg-border my-0.5" />
                                        <button
                                          type="button"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            agregarValor(queryTrimmed);
                                          }}
                                          className="w-full text-left px-2.5 py-1.5 text-sm text-primary font-semibold hover:bg-primary/10 rounded-md transition-colors"
                                        >
                                          + Crear &quot;{queryTrimmed}&quot;
                                          como nuevo
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <Button type="button" variant="ghost" onClick={handleAddOption}>
              <Plus className="w-4 h-4 mr-2" /> Agregar nueva propiedad
            </Button>
          </div>

          {showMatrix && matrixProps && (
            <VariantSelectionMatrix opciones={opciones} {...matrixProps} />
          )}

          <div className="pt-4 border-t border-border mt-6">
            <Label className="text-sm font-bold mb-3 block">
              Variantes generadas
            </Label>

            {variantes.length === 0 ? (
              <div className="border border-border border-dashed rounded-xl p-8 flex flex-col items-center justify-center bg-card">
                <Layers className="w-5 h-5 text-muted-foreground/50" />
                <p className="text-sm font-semibold text-foreground pt-4">
                  No hay datos
                </p>
                <p className="text-xs text-muted-foreground mt-1 text-center max-w-60">
                  Agrega propiedades y valores arriba para generar
                  automáticamente tus variantes.
                </p>
              </div>
            ) : (
              <div className="border border-border rounded-xl shadow-none">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap bg-card">
                    <thead className="bg-sidebar text-muted-foreground text-[10px] uppercase font-bold tracking-widest border-b border-border">
                      <tr>
                        {/* <th className="px-4 py-3 w-16">Image</th> */}
                        <th className="px-4 py-3">Variante</th>
                        <th className="px-4 py-3 w-32">Precio ($)</th>
                        {showAdvancedColumns && (
                          <th className="px-4 py-3 w-32">Costo ($)</th>
                        )}
                        <th className="px-4 py-3 w-28">Stock</th>
                        {showAdvancedColumns && (
                          <th className="px-4 py-3 w-32">SKU</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {variantes.map((v) => (
                        <tr
                          key={v.key}
                          className="hover:bg-muted/5 transition-colors"
                        >
                          {/* <td className="px-4 py-3">
                            <div className="w-8 h-8 rounded bg-[#f4f4f5] border border-border flex items-center justify-center cursor-not-allowed opacity-50">
                              <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </td> */}
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {Object.values(v.valores).join(" / ")}
                          </td>
                          <td className="px-2 py-2">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                                $
                              </span>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                placeholder={precioVenta || "0"}
                                className="h-8 shadow-none pl-6 text-xs bg-transparent"
                                value={v.precio}
                                onChange={(e) =>
                                  handleVarChange(
                                    v.key,
                                    "precio",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                          </td>
                          {showAdvancedColumns && (
                            <td className="px-2 py-2">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                                  $
                                </span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="Hereda"
                                  className="h-8 shadow-none pl-6 text-xs bg-transparent"
                                  value={v.precio_costo}
                                  onChange={(e) =>
                                    handleVarChange(
                                      v.key,
                                      "precio_costo",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              className="h-8 shadow-none px-2 text-xs bg-transparent"
                              value={v.stock}
                              onChange={(e) =>
                                handleVarChange(v.key, "stock", e.target.value)
                              }
                            />
                          </td>
                          {showAdvancedColumns && (
                            <td className="px-2 py-2">
                              <Input
                                placeholder="-"
                                className="h-8 shadow-none px-2 text-xs bg-transparent uppercase"
                                value={v.sku}
                                onChange={(e) =>
                                  handleVarChange(v.key, "sku", e.target.value)
                                }
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
