"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { Producto } from "@/entities/productos/types";
import { Button } from "@/shared/ui/button";
import { createClient } from "@/shared/config/supabase/client";
import { optimizarImagen } from "@/shared/utils/image-optimizer";
import { parseProductImages } from "../lib/stock-product-utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { editarProductoAction } from "../actions/edit-product";
import { useVariantSelection } from "../hooks/use-variant-selection";
import type { CategoriaOption, ProductActionState } from "../types";
import {
  buildVariantKey,
  isSingleVariantProduct,
  parseLegacyVariant,
} from "../utils/parse-legacy-variant";
import {
  ConfirmSaveVariantsModal,
  type VarianteDiffRow,
} from "./confirm-save-variants-modal";
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

export function ProductEditDetailSheet({
  producto,
  children,
  open,
  onOpenChange,
  hideTrigger = false,
}: Readonly<ProductEditDetailSheetProps>) {
  const router = useRouter();
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
  // URLs de imagen_url que el usuario tildó para borrar en esta sesión de
  // edición. No tocamos producto.imagen_url localmente: el servidor arma
  // el resultado final partiendo del imagen_url real en base (ver
  // editarProductoAction), esta lista solo indica la intención del click.
  const [imagenesExistentesAQuitar, setImagenesExistentesAQuitar] = useState<
    string[]
  >([]);
  const [isCompressing, setIsCompressing] = useState(false);
  // Última barrera antes de guardar un producto con variantes: comparamos
  // el payload que se va a mandar contra lo que HOY existe en base (no
  // contra el estado local del formulario, que puede haber perdido una
  // combinación sin que nadie lo note — el caso exacto de este incidente).
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffFilas, setDiffFilas] = useState<VarianteDiffRow[]>([]);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
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

  // Las combinaciones que ya existen en producto_variantes (reconstruidas
  // arriba por parseLegacyVariant) arrancan tildadas en la matriz — el
  // vendedor no debe perder Stock/Precio/SKU ya cargados solo por abrir
  // el formulario de edición.
  const variantSelection = useVariantSelection({
    initialOpciones: parsedProducto.opciones,
    initialVariantes: parsedProducto.variantes,
  });

  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

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

  const resetFormState = () => {
    setArchivos([]);
    setImagenesExistentesAQuitar([]);
    setCategoriaSeleccionada(producto.categoria_id || "");
    setStatus(producto.publicado ? "active" : "inactive");
    setShowPrice(true);
    setShowInventory(true);
    setShowVariants(!isSimpleProduct);
    setPrecioCosto(producto.precio_costo?.toString() || "");
    setPrecioVenta(producto.precio?.toString() || "");
    variantSelection.reset(parsedProducto.opciones, parsedProducto.variantes);
  };

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (!open) resetFormState();
  };

  const [, formAction, isPending] = useActionState(
    async (
      prevState: ProductActionState,
      formData: FormData,
    ): Promise<ProductActionState> => {
      formData.append("id", producto.id);
      formData.append("tieneVariantes", showVariants.toString());
      if (imagenesExistentesAQuitar.length > 0) {
        formData.append(
          "imagenesAEliminar",
          JSON.stringify(imagenesExistentesAQuitar),
        );
      }
      if (showVariants) {
        formData.append("opciones", JSON.stringify(variantSelection.opciones));
        formData.append(
          "variantes",
          JSON.stringify(variantSelection.variantes),
        );
      }

      const result = await editarProductoAction(prevState, formData);
      if (result.success) {
        toast.success("Producto actualizado");
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
      const archivosComprimidos = await Promise.all(
        archivos.map((file) => optimizarImagen(file)),
      );
      archivosComprimidos.forEach((file) => formData.append("imagenes", file));
      setIsCompressing(false);
    }

    if (showVariants) {
      await abrirConfirmacionVariantes(formData);
    } else {
      startTransition(() => formAction(formData));
    }
  };

  // Última barrera humana antes de guardar: comparamos el payload que se
  // va a mandar contra lo que HOY existe en producto_variantes — traído
  // fresco en este momento, no contra variantSelection.variantes (el
  // estado local del formulario), porque el estado local es justamente lo
  // que puede haber perdido una combinación sin que el usuario lo note.
  const abrirConfirmacionVariantes = async (formData: FormData) => {
    setPendingFormData(formData);
    setConfirmModalOpen(true);
    setIsLoadingDiff(true);

    const supabase = createClient();
    const { data: existentes } = await supabase
      .from("producto_variantes")
      .select("id, nombre_display, atributos, precio, costo, stock")
      .eq("producto_id", producto.id);

    const formVariantesPorKey = new Map(
      variantSelection.variantes.map((v) => [buildVariantKey(v.valores), v]),
    );

    const filas: VarianteDiffRow[] = (existentes ?? []).map((ex) => {
      const atributos = (ex.atributos as Record<string, string>) ?? {};
      const key = buildVariantKey(atributos);
      const enPayload = formVariantesPorKey.get(key);
      const stockDespues = enPayload
        ? enPayload.stock?.trim()
          ? Number.parseInt(enPayload.stock)
          : ex.stock
        : null;
      const precioDespues = enPayload
        ? enPayload.precio?.trim()
          ? Number.parseFloat(enPayload.precio)
          : null
        : null;

      return {
        key,
        atributosLabel:
          Object.entries(atributos)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" / ") ||
          ex.nombre_display ||
          "Variante",
        stockAntes: ex.stock,
        stockDespues,
        precioAntes: ex.precio ? Number(ex.precio) : null,
        precioDespues,
        seVaAEliminar: !enPayload,
      };
    });

    filas.sort((a, b) => Number(b.seVaAEliminar) - Number(a.seVaAEliminar));

    setDiffFilas(filas);
    setIsLoadingDiff(false);
  };

  const handleConfirmSave = () => {
    if (!pendingFormData) return;
    setConfirmModalOpen(false);
    startTransition(() => formAction(pendingFormData));
    setPendingFormData(null);
  };

  return (
    <>
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

          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
            <form
              onSubmit={handleSubmit}
              id="edit-product-form"
              className="max-w-3xl mx-auto space-y-6"
            >
              <ProductMediaSection
                archivos={archivos}
                onArchivosChange={setArchivos}
                existingImages={parseProductImages(producto.imagen_url).filter(
                  (url) => !imagenesExistentesAQuitar.includes(url),
                )}
                onRemoveExistingImage={(url) =>
                  setImagenesExistentesAQuitar((prev) => [...prev, url])
                }
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
                recargoPorcentaje={recargoPorcentaje}
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
                opciones={variantSelection.opciones}
                resetOpciones={() => variantSelection.reset()}
                customTypeMode={variantSelection.customTypeMode}
                setCustomTypeMode={variantSelection.setCustomTypeMode}
                focusedOptionId={variantSelection.focusedOptionId}
                setFocusedOptionId={variantSelection.setFocusedOptionId}
                precioVenta={precioVenta}
                variantes={variantSelection.variantes}
                duplicatePropertyNames={variantSelection.duplicatePropertyNames}
                genericPropertyNames={variantSelection.genericPropertyNames}
                handleAddOption={variantSelection.handleAddOption}
                handleRemoveOption={variantSelection.handleRemoveOption}
                handleUpdateOptionName={variantSelection.handleUpdateOptionName}
                handleAddOptionValue={variantSelection.handleAddOptionValue}
                handleRemoveOptionValue={
                  variantSelection.handleRemoveOptionValue
                }
                handleVarChange={variantSelection.handleVarChange}
                ensureSuggestionsLoaded={
                  variantSelection.ensureSuggestionsLoaded
                }
                isLoadingSuggestions={variantSelection.isLoadingSuggestions}
                getFilteredSuggestions={variantSelection.getFilteredSuggestions}
                showAdvancedColumns
                baseVariants={variantSelection.baseVariants}
                selectedCombinations={variantSelection.selectedCombinations}
                onToggleCombination={variantSelection.handleToggleCombination}
                onBulkSetSelection={variantSelection.handleBulkSetSelection}
                onInvertSelection={variantSelection.handleInvertSelection}
                pivotSelections={variantSelection.pivotSelections}
                onPivotChange={variantSelection.handlePivotChange}
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
              variantSelection.duplicatePropertyNames.size > 0
                ? "Resolvé los nombres de propiedad duplicados antes de guardar."
                : variantSelection.genericPropertyNames.size > 0
                  ? "Renombrá las propiedades con nombre genérico (Propiedad/Opción) antes de guardar."
                  : null
            }
          />
        </SheetContent>
      </Sheet>
      <ConfirmSaveVariantsModal
        open={confirmModalOpen}
        onOpenChange={(open) => {
          setConfirmModalOpen(open);
          if (!open) setPendingFormData(null);
        }}
        isLoadingDiff={isLoadingDiff}
        filas={diffFilas}
        isSubmitting={isPending}
        onConfirm={handleConfirmSave}
      />
    </>
  );
}

export const EditarProductoSheet = ProductEditDetailSheet;
export const EditarProductoModal = ProductEditDetailSheet;
