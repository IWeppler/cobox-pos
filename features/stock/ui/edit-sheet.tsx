"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { Producto } from "@/entities/productos/types";
import { Button } from "@/shared/ui/button";
import { createClient } from "@/shared/config/supabase/client";
import { optimizarImagen } from "@/shared/utils/image-optimizer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { editarProductoAction } from "../actions/edit-product";
import { PREDEFINED_COLORS, PREDEFINED_SIZES } from "../types/constants";
import type {
  CategoriaOption,
  Opcion,
  ProductActionState,
  VarianteInput,
  VariantDataState,
} from "../types";
import {
  buildVariantKey,
  isSingleVariantProduct,
  parseLegacyVariant,
} from "../utils/parse-legacy-variant";
import { findDuplicatePropertyNames } from "../utils/validate-opciones";
import { CreateProductFooter } from "./create-product/create-product-footer";
import { ProductBasicInfoSection } from "./create-product/product-basic-info-section";
import { ProductCategorySection } from "./create-product/product-category-section";
import { ProductInventorySection } from "./create-product/product-inventory-section";
import { ProductMediaSection } from "./create-product/product-media-section";
import { ProductPriceSection } from "./create-product/product-price-section";
import { ProductVariantsSection } from "./create-product/product-variants-section";

type EditableProducto = Producto & {
  categoria_id?: string | null;
};

type ProductEditDetailSheetProps = {
  producto: EditableProducto;
  userRole?: string;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

function buildVariantsFromOptions(
  opciones: Opcion[],
  currentVariants: VarianteInput[],
) {
  const opcionesValidas = opciones.filter(
    (opcion) => opcion.nombre.trim() && opcion.valores.length > 0,
  );

  if (opcionesValidas.length === 0) return currentVariants;

  let combinaciones: string[][] = [[]];
  for (const opcion of opcionesValidas) {
    const nextCombinaciones: string[][] = [];
    for (const combo of combinaciones) {
      for (const val of opcion.valores) {
        nextCombinaciones.push([...combo, val]);
      }
    }
    combinaciones = nextCombinaciones;
  }

  return combinaciones.map((valoresPosicionales) => {
    const valores: Record<string, string> = {};
    opcionesValidas.forEach((opcion, i) => {
      valores[opcion.nombre] = valoresPosicionales[i];
    });

    const key = buildVariantKey(valores);
    // Los valores posicionales son estables mientras se renombra una propiedad
    // (el nombre cambia en cada tecla, pero el orden/valores de las opciones no).
    const signature = valoresPosicionales.join("|");
    const existente = currentVariants.find((variant) => {
      if (variant.key === key) return true;
      const variantValores = Object.values(variant.valores);
      return (
        variantValores.length === valoresPosicionales.length &&
        variantValores.join("|") === signature
      );
    });

    return existente
      ? { ...existente, key, valores }
      : {
          key,
          valores,
          stock: "",
          precio: "",
          precio_costo: "",
          sku: "",
        };
  });
}

function parseProductImages(imagenUrl: EditableProducto["imagen_url"]) {
  if (Array.isArray(imagenUrl)) return imagenUrl;
  if (typeof imagenUrl !== "string" || !imagenUrl) return [];

  try {
    const parsed = JSON.parse(imagenUrl);
    return Array.isArray(parsed) ? parsed : [imagenUrl];
  } catch {
    return [imagenUrl];
  }
}

function getCustomTypeMode(opciones: Opcion[]) {
  return opciones.reduce<Record<string, boolean>>((acc, opcion) => {
    acc[opcion.id] = !["Color", "Talle"].includes(opcion.nombre);
    return acc;
  }, {});
}

export function ProductEditDetailSheet({
  producto,
  children,
  open,
  onOpenChange,
  hideTrigger = false,
}: Readonly<ProductEditDetailSheetProps>) {
  const isSimpleProduct = isSingleVariantProduct(producto);
  // Fuente única de verdad para reconstruir opciones/variantes al cargar:
  // prioriza producto_variantes (nombres de atributo reales) y limpia
  // formatos legacy tipo "TALLE: L" antes de repartirlos en el form.
  const parsedProducto = useMemo(
    () => parseLegacyVariant(producto, isSimpleProduct),
    [producto, isSimpleProduct],
  );

  const [internalOpen, setInternalOpen] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaOption[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(
    producto.categoria_id || "",
  );
  const [status, setStatus] = useState<"active" | "inactive">(
    producto.publicado ? "active" : "inactive",
  );
  const [showPrice, setShowPrice] = useState(true);
  const [showInventory, setShowInventory] = useState(true);
  const [showVariants, setShowVariants] = useState(!isSimpleProduct);
  const [precioCosto, setPrecioCosto] = useState(
    producto.precio_costo?.toString() || "",
  );
  const [precioVenta, setPrecioVenta] = useState(
    producto.precio?.toString() || "",
  );
  const [opciones, setOpciones] = useState<Opcion[]>(parsedProducto.opciones);
  const [variantes, setVariantes] = useState<VarianteInput[]>(
    parsedProducto.variantes,
  );
  const [customTypeMode, setCustomTypeMode] = useState<Record<string, boolean>>(
    () => getCustomTypeMode(parsedProducto.opciones),
  );
  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const duplicatePropertyNames = useMemo(
    () => findDuplicatePropertyNames(opciones),
    [opciones],
  );

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

  const resetFormState = () => {
    setArchivos([]);
    setCategoriaSeleccionada(producto.categoria_id || "");
    setStatus(producto.publicado ? "active" : "inactive");
    setShowPrice(true);
    setShowInventory(true);
    setShowVariants(!isSimpleProduct);
    setPrecioCosto(producto.precio_costo?.toString() || "");
    setPrecioVenta(producto.precio?.toString() || "");
    setOpciones(parsedProducto.opciones);
    setVariantes(parsedProducto.variantes);
    setCustomTypeMode(getCustomTypeMode(parsedProducto.opciones));
    setFocusedOptionId(null);
  };

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (!open) resetFormState();
  };

  const updateOpciones = (nextOpciones: Opcion[]) => {
    setOpciones(nextOpciones);
    if (showVariants) {
      setVariantes((prev) => buildVariantsFromOptions(nextOpciones, prev));
    }
  };

  const handleAddOption = () => {
    updateOpciones([
      ...opciones,
      { id: crypto.randomUUID(), nombre: "", valores: [] },
    ]);
  };

  const handleRemoveOption = (id: string) => {
    updateOpciones(opciones.filter((opcion) => opcion.id !== id));
    setCustomTypeMode((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleUpdateOptionName = (id: string, newName: string) => {
    updateOpciones(
      opciones.map((opcion) =>
        opcion.id === id ? { ...opcion, nombre: newName } : opcion,
      ),
    );
  };

  const handleAddOptionValue = (id: string, value: string) => {
    const val = value.trim();
    updateOpciones(
      opciones.map((opcion) => {
        if (opcion.id === id && val && !opcion.valores.includes(val)) {
          return { ...opcion, valores: [...opcion.valores, val] };
        }
        return opcion;
      }),
    );
  };

  const handleRemoveOptionValue = (id: string, valueToRemove: string) => {
    updateOpciones(
      opciones.map((opcion) =>
        opcion.id === id
          ? {
              ...opcion,
              valores: opcion.valores.filter(
                (valor) => valor !== valueToRemove,
              ),
            }
          : opcion,
      ),
    );
  };

  const handleVarChange = (
    key: string,
    field: keyof VariantDataState,
    value: string,
  ) => {
    setVariantes((prev) =>
      prev.map((variant) =>
        variant.key === key ? { ...variant, [field]: value } : variant,
      ),
    );
  };

  const getSuggestions = (nombre: string, currentValues: string[]) => {
    if (nombre === "Color") {
      return PREDEFINED_COLORS.filter(
        (color) => !currentValues.includes(color),
      );
    }
    if (nombre === "Talle") {
      return PREDEFINED_SIZES.filter((size) => !currentValues.includes(size));
    }
    return [];
  };

  const [, formAction, isPending] = useActionState(
    async (
      prevState: ProductActionState,
      formData: FormData,
    ): Promise<ProductActionState> => {
      formData.append("id", producto.id);
      formData.append("tieneVariantes", showVariants.toString());
      if (showVariants) {
        formData.append("opciones", JSON.stringify(opciones));
        formData.append("variantes", JSON.stringify(variantes));
      }

      const result = await editarProductoAction(prevState, formData);
      if (result.success) {
        toast.success("Producto actualizado");
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
        archivos.map((file) => optimizarImagen(file)),
      );
      archivosComprimidos.forEach((file) => formData.append("imagenes", file));
      setIsCompressing(false);
    }

    startTransition(() => formAction(formData));
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <SheetTrigger asChild>
          {children ?? <Button variant="outline">Editar producto</Button>}
        </SheetTrigger>
      )}

      <SheetContent
        side="right"
        size="wide"
        className="w-full sm:w-3xl! p-0 flex flex-col h-dvh bg-card border-l border-border"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="px-8 py-5 border-b border-border bg-card shrink-0 flex-row items-center justify-between shadow-none z-10 space-y-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpenChange(false)}
              className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <SheetTitle className="text-xl font-bold text-foreground m-0">
                Editar Producto
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {producto.creado_en
                  ? `Actualizado por última vez: ${new Date(
                      producto.creado_en,
                    ).toLocaleDateString("es-AR")}`
                  : "Sin fecha de actualización"}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-8 py-4">
          <form
            onSubmit={handleSubmit}
            id="edit-product-form"
            className="max-w-3xl mx-auto space-y-6"
          >
            <ProductMediaSection
              archivos={archivos}
              onArchivosChange={setArchivos}
              existingImages={parseProductImages(producto.imagen_url)}
              inputId={`imagenes-edit-${producto.id}`}
            />

            <ProductBasicInfoSection
              status={status}
              onStatusChange={setStatus}
              defaultNombre={producto.nombre}
              defaultDescripcion={producto.descripcion}
            />

            <ProductCategorySection
              categorias={categorias}
              categoriaSeleccionada={categoriaSeleccionada}
              onCategoriaSeleccionadaChange={setCategoriaSeleccionada}
            />

            <ProductPriceSection
              showPrice={showPrice}
              onShowPriceChange={setShowPrice}
              precioCosto={precioCosto}
              onPrecioCostoChange={setPrecioCosto}
              precioVenta={precioVenta}
              onPrecioVentaChange={setPrecioVenta}
              gananciaNeta={gananciaNeta}
              margenPorcentaje={margenPorcentaje}
            />

            <ProductInventorySection
              showVariants={showVariants}
              showInventory={showInventory}
              onShowInventoryChange={setShowInventory}
              defaultStock={producto.stock?.[0]?.cantidad || 0}
            />

            <ProductVariantsSection
              showVariants={showVariants}
              onShowVariantsChange={setShowVariants}
              opciones={opciones}
              resetOpciones={() => {
                setOpciones([]);
                setVariantes([]);
              }}
              customTypeMode={customTypeMode}
              setCustomTypeMode={setCustomTypeMode}
              focusedOptionId={focusedOptionId}
              setFocusedOptionId={setFocusedOptionId}
              precioVenta={precioVenta}
              variantes={variantes}
              duplicatePropertyNames={duplicatePropertyNames}
              handleAddOption={handleAddOption}
              handleRemoveOption={handleRemoveOption}
              handleUpdateOptionName={handleUpdateOptionName}
              handleAddOptionValue={handleAddOptionValue}
              handleRemoveOptionValue={handleRemoveOptionValue}
              handleVarChange={handleVarChange}
              getSuggestions={getSuggestions}
              showAdvancedColumns
            />
          </form>
        </div>

        <CreateProductFooter
          isPending={isPending}
          isCompressing={isCompressing}
          onCancel={() => handleOpenChange(false)}
          formId="edit-product-form"
          cancelLabel="Descartar cambios"
          idleLabel="Guardar Cambios"
          blockedReason={
            duplicatePropertyNames.size > 0
              ? "Resolvé los nombres de propiedad duplicados antes de guardar."
              : null
          }
        />
      </SheetContent>
    </Sheet>
  );
}

export const EditarProductoSheet = ProductEditDetailSheet;
export const EditarProductoModal = ProductEditDetailSheet;
