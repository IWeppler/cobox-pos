"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/shared/config/supabase/client";
import { optimizarImagenProducto } from "@/shared/utils/image-optimizer";
import { crearProductoAction } from "../actions/create-product";
import { useVariantSelection } from "./use-variant-selection";
import type {
  CategoriaOption,
  ProductActionState,
} from "@/features/stock/types";

export function useCreateProductForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);

  const [showPrice, setShowPrice] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showVariants, setShowVariants] = useState(false);

  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [categorias, setCategorias] = useState<CategoriaOption[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [precioCosto, setPrecioCosto] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");

  const variantSelection = useVariantSelection();

  useEffect(() => {
    const fetchCats = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("categorias")
        .select("id, nombre")
        .eq("activa", true)
        .is("parent_id", null)
        .order("orden");

      if (data && data.length > 0) setCategorias(data);
    };

    fetchCats();
  }, []);

  const costoNum = parseFloat(precioCosto) || 0;
  const ventaNum = parseFloat(precioVenta) || 0;
  const gananciaNeta = ventaNum > costoNum ? ventaNum - costoNum : 0;
  const recargoPorcentaje =
    costoNum > 0 && gananciaNeta > 0
      ? ((gananciaNeta / costoNum) * 100).toFixed(1)
      : "0";

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setArchivos([]);
      setShowPrice(false);
      setShowInventory(false);
      setShowVariants(false);
      setStatus("active");
      setCategoriaSeleccionada("");
      setPrecioCosto("");
      setPrecioVenta("");
      variantSelection.reset();
    }
  };

  const [, formAction, isPending] = useActionState(
    async (
      prevState: ProductActionState,
      formData: FormData,
    ): Promise<ProductActionState> => {
      formData.append("tieneVariantes", showVariants.toString());
      if (showVariants) {
        formData.append("opciones", JSON.stringify(variantSelection.opciones));
        formData.append(
          "variantes",
          JSON.stringify(variantSelection.variantes),
        );
      }

      const result = await crearProductoAction(prevState, formData);
      if (result.success) {
        toast.success("Producto creado con éxito");
        handleOpenChange(false);
        router.refresh();
      } else if (result.error) {
        toast.error(result.error);
      }

      return result;
    },
    { error: null, success: false },
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!precioVenta || !precioCosto) {
      setShowPrice(true);
      toast.error("Por favor completa los precios del producto.");
      return;
    }

    if (!showVariants && !formData.get("stockBase")) {
      setShowInventory(true);
      toast.error("Por favor indica el stock inicial.");
      return;
    }

    if (showVariants && variantSelection.duplicatePropertyNames.size > 0) {
      toast.error(
        "Resolvé los nombres de propiedad duplicados antes de guardar.",
      );
      return;
    }

    if (showVariants && variantSelection.genericPropertyNames.size > 0) {
      toast.error(
        "Renombrá las propiedades con nombre genérico (Propiedad/Opción) antes de guardar.",
      );
      return;
    }

    if (archivos.length > 0) {
      setIsCompressing(true);
      formData.delete("imagenes");
      formData.delete("thumbnails");
      formData.delete("grids");

      const imagenesOptimizadas = await Promise.all(
        archivos.map((f) => optimizarImagenProducto(f)),
      );

      imagenesOptimizadas.forEach(({ main, thumbnail, grid }) => {
        formData.append("imagenes", main);
        formData.append("thumbnails", thumbnail);
        formData.append("grids", grid);
      });

      setIsCompressing(false);
    }

    startTransition(() => formAction(formData));
  };

  return {
    isOpen,
    handleOpenChange,
    archivos,
    setArchivos,
    isCompressing,
    showPrice,
    setShowPrice,
    showInventory,
    setShowInventory,
    showVariants,
    setShowVariants,
    status,
    setStatus,
    categorias,
    categoriaSeleccionada,
    setCategoriaSeleccionada,
    precioCosto,
    setPrecioCosto,
    precioVenta,
    setPrecioVenta,
    gananciaNeta,
    recargoPorcentaje,
    opciones: variantSelection.opciones,
    setOpciones: variantSelection.setOpciones,
    customTypeMode: variantSelection.customTypeMode,
    setCustomTypeMode: variantSelection.setCustomTypeMode,
    focusedOptionId: variantSelection.focusedOptionId,
    setFocusedOptionId: variantSelection.setFocusedOptionId,
    variantes: variantSelection.variantes,
    baseVariants: variantSelection.baseVariants,
    selectedCombinations: variantSelection.selectedCombinations,
    pivotSelections: variantSelection.pivotSelections,
    duplicatePropertyNames: variantSelection.duplicatePropertyNames,
    genericPropertyNames: variantSelection.genericPropertyNames,
    isPending,
    handleSubmit,
    handleAddOption: variantSelection.handleAddOption,
    handleRemoveOption: variantSelection.handleRemoveOption,
    handleUpdateOptionName: variantSelection.handleUpdateOptionName,
    handleAddOptionValue: variantSelection.handleAddOptionValue,
    handleRemoveOptionValue: variantSelection.handleRemoveOptionValue,
    handleVarChange: variantSelection.handleVarChange,
    handleToggleCombination: variantSelection.handleToggleCombination,
    handleBulkSetSelection: variantSelection.handleBulkSetSelection,
    handleInvertSelection: variantSelection.handleInvertSelection,
    handlePivotChange: variantSelection.handlePivotChange,
    ensureSuggestionsLoaded: variantSelection.ensureSuggestionsLoaded,
    isLoadingSuggestions: variantSelection.isLoadingSuggestions,
    getFilteredSuggestions: variantSelection.getFilteredSuggestions,
  };
}
