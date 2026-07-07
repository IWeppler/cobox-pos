"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { createClient } from "@/shared/config/supabase/client";
import { optimizarImagen } from "@/shared/utils/image-optimizer";
import { crearProductoAction } from "../actions/create-product";
import { PREDEFINED_COLORS, PREDEFINED_SIZES } from "../types/constants";
import { buildVariantKey } from "../utils/parse-legacy-variant";
import { findDuplicatePropertyNames } from "../utils/validate-opciones";
import type {
  BaseVariant,
  CategoriaOption,
  Opcion,
  ProductActionState,
  VarianteInput,
  VariantDataState,
} from "@/features/stock/types";

function buildCartesianVariants(opciones: Opcion[]): BaseVariant[] {
  const opcionesValidas = opciones.filter(
    (o) => o.nombre.trim() && o.valores.length > 0,
  );

  if (opcionesValidas.length === 0) return [];

  let results: Record<string, string>[] = [{}];
  for (const opcion of opcionesValidas) {
    const nextResults: Record<string, string>[] = [];
    for (const res of results) {
      for (const val of opcion.valores) {
        nextResults.push({ ...res, [opcion.nombre]: val });
      }
    }
    results = nextResults;
  }

  return results.map((res) => ({
    key: buildVariantKey(res),
    valores: res,
  }));
}

export function useCreateProductForm() {
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

  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [variantData, setVariantData] = useState<
    Record<string, VariantDataState>
  >({});
  const [customTypeMode, setCustomTypeMode] = useState<Record<string, boolean>>(
    {},
  );
  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);
  const [selectedCombinations, setSelectedCombinations] = useState<
    Record<string, boolean>
  >({});
  const [pivotSelections, setPivotSelections] = useState<
    Record<string, string>
  >({});

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
  const margenPorcentaje =
    costoNum > 0 && gananciaNeta > 0
      ? ((gananciaNeta / costoNum) * 100).toFixed(1)
      : "0";

  const baseVariants = useMemo(() => {
    if (!showVariants) return [];
    return buildCartesianVariants(opciones);
  }, [opciones, showVariants]);

  const opcionesValidasCount = useMemo(
    () => opciones.filter((o) => o.nombre.trim() && o.valores.length > 0).length,
    [opciones],
  );

  // Con una sola propiedad activa, todas las combinaciones arrancan
  // seleccionadas (paridad con el comportamiento anterior). Con 2 o más,
  // el vendedor elige a mano en la matriz. No se escribe nada en
  // selectedCombinations hasta que el usuario interactúa.
  const variantes: VarianteInput[] = useMemo(() => {
    return baseVariants
      .filter(
        (b) => selectedCombinations[b.key] ?? opcionesValidasCount === 1,
      )
      .map((b) => ({
        key: b.key,
        valores: b.valores,
        stock: variantData[b.key]?.stock || "",
        precio: variantData[b.key]?.precio || "",
        precio_costo: variantData[b.key]?.precio_costo || "",
        sku: variantData[b.key]?.sku || "",
      }));
  }, [baseVariants, variantData, selectedCombinations, opcionesValidasCount]);

  const duplicatePropertyNames = useMemo(
    () => findDuplicatePropertyNames(opciones),
    [opciones],
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setArchivos([]);
      setShowPrice(false);
      setShowInventory(false);
      setShowVariants(false);
      setOpciones([]);
      setVariantData({});
      setStatus("active");
      setCategoriaSeleccionada("");
      setPrecioCosto("");
      setPrecioVenta("");
      setCustomTypeMode({});
      setFocusedOptionId(null);
      setSelectedCombinations({});
      setPivotSelections({});
    }
  };

  const handleAddOption = () => {
    setOpciones((prev) => [
      ...prev,
      { id: crypto.randomUUID(), nombre: "", valores: [] },
    ]);
  };

  const handleRemoveOption = (id: string) => {
    setOpciones((prev) => prev.filter((o) => o.id !== id));
    setCustomTypeMode((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleUpdateOptionName = (id: string, newName: string) => {
    setOpciones((prev) =>
      prev.map((o) => (o.id === id ? { ...o, nombre: newName } : o)),
    );
  };

  const handleAddOptionValue = (id: string, value: string) => {
    const val = value.trim();
    setOpciones((prev) =>
      prev.map((o) => {
        if (o.id === id && val && !o.valores.includes(val)) {
          return { ...o, valores: [...o.valores, val] };
        }
        return o;
      }),
    );
  };

  const handleRemoveOptionValue = (id: string, valueToRemove: string) => {
    setOpciones((prev) =>
      prev.map((o) =>
        o.id === id
          ? { ...o, valores: o.valores.filter((v) => v !== valueToRemove) }
          : o,
      ),
    );
  };

  const handleVarChange = (
    key: string,
    field: keyof VariantDataState,
    value: string,
  ) => {
    setVariantData((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { stock: "", precio: "", precio_costo: "", sku: "" }),
        [field]: value,
      },
    }));
  };

  const handleToggleCombination = (key: string) => {
    setSelectedCombinations((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? opcionesValidasCount === 1),
    }));
  };

  const handleBulkSetSelection = (keys: string[], value: boolean) => {
    setSelectedCombinations((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = value;
      });
      return next;
    });
  };

  const handleInvertSelection = (keys: string[]) => {
    setSelectedCombinations((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = !(prev[key] ?? opcionesValidasCount === 1);
      });
      return next;
    });
  };

  const handlePivotChange = (propName: string, value: string) => {
    setPivotSelections((prev) => ({ ...prev, [propName]: value }));
  };

  const getSuggestions = (nombre: string, currentValues: string[]) => {
    if (nombre === "Color") {
      return PREDEFINED_COLORS.filter((c) => !currentValues.includes(c));
    }
    if (nombre === "Talle") {
      return PREDEFINED_SIZES.filter((s) => !currentValues.includes(s));
    }
    return [];
  };

  const [, formAction, isPending] = useActionState(
    async (
      prevState: ProductActionState,
      formData: FormData,
    ): Promise<ProductActionState> => {
      formData.append("tieneVariantes", showVariants.toString());
      if (showVariants) {
        formData.append("opciones", JSON.stringify(opciones));
        formData.append("variantes", JSON.stringify(variantes));
      }

      const result = await crearProductoAction(prevState, formData);
      if (result.success) {
        toast.success("Producto creado con éxito");
        handleOpenChange(false);
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

    if (showVariants && duplicatePropertyNames.size > 0) {
      toast.error("Resolvé los nombres de propiedad duplicados antes de guardar.");
      return;
    }

    if (archivos.length > 0) {
      setIsCompressing(true);
      formData.delete("imagenes");
      const archivosComprimidos = await Promise.all(
        archivos.map((f) => optimizarImagen(f)),
      );
      archivosComprimidos.forEach((f) => formData.append("imagenes", f));
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
    margenPorcentaje,
    opciones,
    setOpciones,
    customTypeMode,
    setCustomTypeMode,
    focusedOptionId,
    setFocusedOptionId,
    variantes,
    baseVariants,
    selectedCombinations,
    pivotSelections,
    duplicatePropertyNames,
    isPending,
    handleSubmit,
    handleAddOption,
    handleRemoveOption,
    handleUpdateOptionName,
    handleAddOptionValue,
    handleRemoveOptionValue,
    handleVarChange,
    handleToggleCombination,
    handleBulkSetSelection,
    handleInvertSelection,
    handlePivotChange,
    getSuggestions,
  };
}
