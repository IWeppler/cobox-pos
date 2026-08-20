"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/shared/config/supabase/client";
import {
  ImagenError,
  optimizarImagenesProducto,
} from "@/shared/utils/image-optimizer";
import { crearProductoAction } from "../actions/create-product";
import { esErrorDeRed, mensajeErrorDeRed } from "@/shared/lib/error-de-red";
import { useVariantSelection } from "./use-variant-selection";
import { queryKeys } from "@/shared/lib/query-keys";
import {
  marcarFinOperacion,
  marcarInicioOperacion,
} from "@/shared/lib/breadcrumb-carga";
import type {
  CategoriaOption,
  ProductActionState,
} from "@/features/stock/types";

/** Apertura controlada desde afuera. Sirve para montar UNA sola instancia del
 * sheet y dispararla desde varios botones (ej: el botón de la toolbar en
 * desktop y el ítem del dropdown en mobile) sin duplicar el hook — que trae
 * su propio fetch de categorías y su propio useActionState. */
type ControlDeApertura = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function useCreateProductForm(control?: ControlDeApertura) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpenInterno, setIsOpenInterno] = useState(false);
  const esControlado = control?.open !== undefined;
  const isOpen = esControlado ? control.open! : isOpenInterno;
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

  const variantSelection = useVariantSelection({ categoriaId: categoriaSeleccionada });

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

  // Todos los cierres del sheet pasan por acá (botón cancelar, flecha del
  // header y el cierre automático tras crear el producto), así que avisarle
  // al padre desde este único lugar alcanza para que no quede colgado.
  const handleOpenChange = (open: boolean) => {
    if (!esControlado) setIsOpenInterno(open);
    control?.onOpenChange?.(open);
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

      // Mismo blindaje que en la edición: un corte de red subiendo fotos no
      // puede tumbar la app entera. Ver el comentario largo en edit-sheet.tsx.
      //
      // Diferencia importante con la edición: acá el reintento puede DUPLICAR.
      // `Failed to fetch` no distingue "no llegó" de "llegó y se perdió la
      // respuesta", así que el producto pudo haberse creado igual. Por eso el
      // mensaje avisa que revise antes de reintentar, en vez de invitar a
      // apretar Guardar otra vez a ciegas.
      let result: ProductActionState;
      try {
        result = await crearProductoAction(prevState, formData);
      } catch (error) {
        if (!esErrorDeRed(error)) throw error;

        const mensaje = `${mensajeErrorDeRed("crear el producto")} Antes de volver a guardarlo, fijate en la lista si quedó creado.`;
        toast.error(mensaje);
        return { error: mensaje, success: false };
      }

      if (result.success) {
        toast.success("Producto creado con éxito");
        handleOpenChange(false);
        queryClient.invalidateQueries({ queryKey: queryKeys.stock.index });
        queryClient.invalidateQueries({ queryKey: queryKeys.pos.productos });
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

    if (showVariants && variantSelection.missingRequiredAttributes.size > 0) {
      toast.error(
        "Esta categoría exige valores para uno o más atributos requeridos — completalos antes de guardar.",
      );
      return;
    }

    if (archivos.length > 0) {
      setIsCompressing(true);
      // Miga de pan: si la pestaña muere acá (el crash por memoria no tira
      // excepción), al recargar se reporta como "posible-crash-renderer" con
      // cuántas imágenes había. Sin esto no queda rastro en ningún lado.
      marcarInicioOperacion("crear-producto:comprimir-imagenes", {
        cantidadImagenes: archivos.length,
        bytesTotales: archivos.reduce((acc, f) => acc + f.size, 0),
      });
      formData.delete("imagenes");
      formData.delete("thumbnails");
      formData.delete("grids");
      formData.delete("masters");

      // Secuencial a propósito (ver optimizarImagenesProducto): en paralelo
      // el pico de memoria mataba la pestaña en mobile.
      try {
        const imagenesOptimizadas = await optimizarImagenesProducto(archivos);

        imagenesOptimizadas.forEach(({ main, thumbnail, grid, master }) => {
          formData.append("imagenes", main);
          formData.append("thumbnails", thumbnail);
          formData.append("grids", grid);
          formData.append("masters", master);
        });
      } catch (error) {
        // Cortamos el guardado: mandar el archivo sin comprimir era lo que
        // hacía explotar el límite de body de la Server Action en silencio.
        toast.error(
          error instanceof ImagenError
            ? error.message
            : "No se pudieron procesar las imágenes. Probá con menos fotos o volvé a intentar.",
        );
        return;
      } finally {
        // finally y no una línea suelta: si la compresión tira, el form
        // quedaba trabado en "comprimiendo" para siempre.
        setIsCompressing(false);
        marcarFinOperacion();
      }
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
    atributosExistentes: variantSelection.atributosExistentes,
    atributosRequeridosNombres: variantSelection.atributosRequeridosNombres,
    missingRequiredAttributes: variantSelection.missingRequiredAttributes,
  };
}
