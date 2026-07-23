"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildVariantKey } from "../utils/parse-legacy-variant";
import {
  findDuplicatePropertyNames,
  findGenericPropertyNames,
} from "../utils/validate-opciones";
import type {
  BaseVariant,
  Opcion,
  VarianteInput,
  VariantDataState,
} from "../types";
import { slugify } from "@/shared/utils/slugify";
import {
  getAtributoValorSuggestionsAction,
  getAtributosExistentesAction,
  type SugerenciaValorAtributo,
} from "../actions/get-attribute-suggestions";

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

  // Sugerencias de valores por atributo (Color, Talle, o cualquier
  // propiedad libre), cacheadas por nombre normalizado — se piden una
  // vez al enfocar el campo, no en cada tecla. La fuente real es
  // producto_variantes.atributos vía RPC (ver
  // get-attribute-suggestions.ts), no un catálogo estático.
  const [suggestionsCache, setSuggestionsCache] = useState<
    Record<string, SugerenciaValorAtributo[]>
  >({});
  const [loadingSuggestionsFor, setLoadingSuggestionsFor] = useState<
    Set<string>
  >(new Set());

  // Nombres de propiedad ya usados en el catálogo (p.ej. "Género"), para
  // ofrecerlos en el dropdown de Propiedad además de Talle/Color. Se pide
  // una sola vez por sesión de formulario — la lista de atributos no
  // cambia mientras el usuario está cargando un producto.
  const [atributosExistentes, setAtributosExistentes] = useState<string[]>(
    [],
  );

  useEffect(() => {
    getAtributosExistentesAction().then(setAtributosExistentes);
  }, []);

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

  const genericPropertyNames = useMemo(
    () => findGenericPropertyNames(opciones),
    [opciones],
  );

  // Todos los handlers de acá para abajo van en useCallback con deps
  // mínimas — son props de ProductVariantsSection/VariantSelectionMatrix,
  // memoizados con React.memo porque escalan con la cantidad de variantes
  // (hasta cientos de filas). Sin referencias estables acá, el memo no
  // sirve de nada: React igual las trataría como props nuevas en cada
  // render del formulario padre.
  const reset = useCallback(
    (nextOpciones: Opcion[] = [], nextVariantes: VarianteInput[] = []) => {
      const seeded = seedFromExistingVariantes(nextVariantes);
      setOpciones(nextOpciones);
      setVariantData(seeded.variantData);
      setSelectedCombinations(seeded.selectedCombinations);
      setPivotSelections({});
      setCustomTypeMode(getCustomTypeModeFromOpciones(nextOpciones));
      setFocusedOptionId(null);
    },
    [],
  );

  const handleAddOption = useCallback(() => {
    setOpciones((prev) => [
      ...prev,
      { id: crypto.randomUUID(), nombre: "", valores: [] },
    ]);
  }, []);

  const handleRemoveOption = useCallback((id: string) => {
    setOpciones((prev) => prev.filter((o) => o.id !== id));
    setCustomTypeMode((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleUpdateOptionName = useCallback((id: string, newName: string) => {
    setOpciones((prev) =>
      prev.map((o) => (o.id === id ? { ...o, nombre: newName } : o)),
    );
  }, []);

  const handleAddOptionValue = useCallback((id: string, value: string) => {
    const val = value.trim();
    setOpciones((prev) =>
      prev.map((o) => {
        if (o.id === id && val && !o.valores.includes(val)) {
          return { ...o, valores: [...o.valores, val] };
        }
        return o;
      }),
    );
  }, []);

  const handleRemoveOptionValue = useCallback(
    (id: string, valueToRemove: string) => {
      setOpciones((prev) =>
        prev.map((o) =>
          o.id === id
            ? { ...o, valores: o.valores.filter((v) => v !== valueToRemove) }
            : o,
        ),
      );
    },
    [],
  );

  const handleVarChange = useCallback(
    (key: string, field: keyof VariantDataState, value: string) => {
      setVariantData((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {
            stock: "",
            precio: "",
            precio_costo: "",
            sku: "",
          }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleToggleCombination = useCallback(
    (key: string) => {
      setSelectedCombinations((prev) => ({
        ...prev,
        [key]: !(prev[key] ?? opcionesValidasCount === 1),
      }));
    },
    [opcionesValidasCount],
  );

  const handleBulkSetSelection = useCallback((keys: string[], value: boolean) => {
    setSelectedCombinations((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = value;
      });
      return next;
    });
  }, []);

  const handleInvertSelection = useCallback(
    (keys: string[]) => {
      setSelectedCombinations((prev) => {
        const next = { ...prev };
        keys.forEach((key) => {
          next[key] = !(prev[key] ?? opcionesValidasCount === 1);
        });
        return next;
      });
    },
    [opcionesValidasCount],
  );

  const handlePivotChange = useCallback((propName: string, value: string) => {
    setPivotSelections((prev) => ({ ...prev, [propName]: value }));
  }, []);

  const ensureSuggestionsLoaded = useCallback(
    (nombre: string) => {
      const key = slugify(nombre);
      if (!key || key in suggestionsCache || loadingSuggestionsFor.has(key)) {
        return;
      }

      setLoadingSuggestionsFor((prev) => new Set(prev).add(key));

      getAtributoValorSuggestionsAction(nombre)
        .then((sugerencias) => {
          setSuggestionsCache((prev) => ({ ...prev, [key]: sugerencias }));
        })
        .finally(() => {
          setLoadingSuggestionsFor((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        });
    },
    [suggestionsCache, loadingSuggestionsFor],
  );

  const isLoadingSuggestions = useCallback(
    (nombre: string) => loadingSuggestionsFor.has(slugify(nombre)),
    [loadingSuggestionsFor],
  );

  const getFilteredSuggestions = useCallback(
    (
      nombre: string,
      query: string,
      currentValues: string[],
    ): SugerenciaValorAtributo[] => {
      const cached = suggestionsCache[slugify(nombre)] ?? [];
      const queryNormalizado = slugify(query);
      const currentValuesNormalizados = new Set(currentValues.map(slugify));

      return cached
        .filter((s) => !currentValuesNormalizados.has(slugify(s.valor)))
        .filter((s) => slugify(s.valor).includes(queryNormalizado))
        .slice(0, 8);
    },
    [suggestionsCache],
  );

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
    genericPropertyNames,
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
    ensureSuggestionsLoaded,
    isLoadingSuggestions,
    getFilteredSuggestions,
    atributosExistentes,
  };
}
