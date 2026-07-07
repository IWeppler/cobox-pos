"use client";

import { useMemo, useState } from "react";
import { PREDEFINED_COLORS, PREDEFINED_SIZES } from "../types/constants";
import { buildVariantKey } from "../utils/parse-legacy-variant";
import { findDuplicatePropertyNames } from "../utils/validate-opciones";
import type {
  BaseVariant,
  Opcion,
  VarianteInput,
  VariantDataState,
} from "../types";

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

function getCustomTypeModeFromOpciones(
  opciones: Opcion[],
): Record<string, boolean> {
  return opciones.reduce<Record<string, boolean>>((acc, opcion) => {
    acc[opcion.id] = !["Color", "Talle"].includes(opcion.nombre);
    return acc;
  }, {});
}

/**
 * Convierte variantes ya persistidas (ej. reconstruidas por
 * parseLegacyVariant al abrir el form de edición) en el par
 * variantData/selectedCombinations que necesita este hook: los valores
 * reales van a variantData, y cada combinación arranca tildada en la
 * matriz — el usuario no debe perder combinaciones ya cargadas solo por
 * abrir el formulario.
 */
function seedFromExistingVariantes(variantes: VarianteInput[]) {
  const variantData: Record<string, VariantDataState> = {};
  const selectedCombinations: Record<string, boolean> = {};

  for (const v of variantes) {
    variantData[v.key] = {
      stock: v.stock,
      precio: v.precio,
      precio_costo: v.precio_costo,
      sku: v.sku,
    };
    selectedCombinations[v.key] = true;
  }

  return { variantData, selectedCombinations };
}

type UseVariantSelectionArgs = {
  initialOpciones?: Opcion[];
  initialVariantes?: VarianteInput[];
};

/**
 * Estado y lógica de opciones/variantes/matriz de selección, compartido
 * entre creación y edición de producto. Deliberadamente NO incluye otros
 * campos del formulario (nombre, categoría, imágenes, precios del
 * producto) porque esos dos flujos los manejan de forma distinta.
 */
export function useVariantSelection({
  initialOpciones = [],
  initialVariantes = [],
}: UseVariantSelectionArgs = {}) {
  const [opciones, setOpciones] = useState<Opcion[]>(initialOpciones);
  const [variantData, setVariantData] = useState<
    Record<string, VariantDataState>
  >(() => seedFromExistingVariantes(initialVariantes).variantData);
  const [selectedCombinations, setSelectedCombinations] = useState<
    Record<string, boolean>
  >(() => seedFromExistingVariantes(initialVariantes).selectedCombinations);
  const [pivotSelections, setPivotSelections] = useState<
    Record<string, string>
  >({});
  const [customTypeMode, setCustomTypeMode] = useState<Record<string, boolean>>(
    () => getCustomTypeModeFromOpciones(initialOpciones),
  );
  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);

  const baseVariants = useMemo(
    () => buildCartesianVariants(opciones),
    [opciones],
  );

  const opcionesValidasCount = useMemo(
    () => opciones.filter((o) => o.nombre.trim() && o.valores.length > 0).length,
    [opciones],
  );

  // Con una sola propiedad activa, todas las combinaciones arrancan
  // tildadas (paridad con el comportamiento anterior de "producto
  // simple"). Con 2 o más, cada combinación respeta lo que ya esté en
  // selectedCombinations — sembrado al inicio con las combinaciones que
  // ya existían en la base (edición) o vacío (creación).
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

  const reset = (
    nextOpciones: Opcion[] = [],
    nextVariantes: VarianteInput[] = [],
  ) => {
    const seeded = seedFromExistingVariantes(nextVariantes);
    setOpciones(nextOpciones);
    setVariantData(seeded.variantData);
    setSelectedCombinations(seeded.selectedCombinations);
    setPivotSelections({});
    setCustomTypeMode(getCustomTypeModeFromOpciones(nextOpciones));
    setFocusedOptionId(null);
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

  return {
    opciones,
    setOpciones,
    customTypeMode,
    setCustomTypeMode,
    focusedOptionId,
    setFocusedOptionId,
    baseVariants,
    variantes,
    selectedCombinations,
    pivotSelections,
    duplicatePropertyNames,
    reset,
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
