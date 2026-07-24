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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Producto, ProductoIndice } from "@/entities/productos/types";
import { Button } from "@/shared/ui/button";
import { createClient } from "@/shared/config/supabase/client";
import { optimizarImagenProducto } from "@/shared/utils/image-optimizer";
import { parseProductImages } from "../lib/stock-product-utils";
import { queryKeys } from "@/shared/lib/query-keys";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import {
  editarProductoAction,
  type EditarProductoResult,
} from "../actions/edit-product";
import { getStockDetalleProductoAction } from "../actions/get-product";
import { useVariantSelection } from "../hooks/use-variant-selection";
import type { CategoriaOption } from "../types";
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
import { ShareButton } from "@/shared/components/share-button";
import {
  armarMensajeProducto,
  construirUrlProducto,
  esVisibleEnCatalogo,
} from "@/shared/utils/compartir-catalogo";
import { formatearMoneda } from "@/shared/utils/formatters";
import { getTotalStock } from "../lib/stock-product-utils";

type ProductEditDetailSheetProps = {
  producto: ProductoIndice;
  userRole?: string;
  nombreComercio?: string;
  mostrarSinStock?: boolean;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

// La fila de /stock rinde 100% desde ProductoIndice (búsqueda/orden/página
// sin red). Este sheet es el único lugar que necesita el detalle completo
// de un producto puntual (descripción, fecha de alta, SKU por variante,
// filas de productos_stock) — lo pide con su propio fetch al abrirse, no
// bloquea la lista ni se dispara por tipeo/filtro/orden.
export function ProductEditDetailSheet({
  producto,
  nombreComercio = "Tienda",
  mostrarSinStock = true,
  children,
  open,
  onOpenChange,
  hideTrigger = false,
}: Readonly<ProductEditDetailSheetProps>) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const urlProducto = producto.slug
    ? construirUrlProducto(baseUrl, producto.slug)
    : null;
  const compartirDeshabilitado =
    !urlProducto ||
    !esVisibleEnCatalogo(
      { publicado: producto.publicado, stockTotal: getTotalStock(producto) },
      { mostrarSinStock },
    );
  const motivoCompartirDeshabilitado = !urlProducto
    ? "Este producto no tiene link público"
    : "Este producto no está visible en el catálogo";

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const {
    data: detalle,
    isLoading: isLoadingDetalle,
    isError: isErrorDetalle,
  } = useQuery({
    queryKey: queryKeys.stock.detalle(producto.id),
    queryFn: async () => {
      const { data, error } = await getStockDetalleProductoAction(
        producto.id,
      );
      if (error || !data) throw new Error(error || "Producto no encontrado.");
      return data;
    },
    enabled: isOpen,
    staleTime: 60 * 1000,
  });

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
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
              onClick={() => setOpen(false)}
              className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <SheetTitle className="text-xl font-bold text-foreground m-0">
                Editar Producto
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {detalle?.creado_en
                  ? `Actualizado por última vez: ${new Date(
                      detalle.creado_en,
                    ).toLocaleDateString("es-AR")}`
                  : " "}
              </p>
            </div>
          </div>

          <ShareButton
            url={urlProducto ?? ""}
            title={`${producto.nombre} | ${nombreComercio}`}
            text={armarMensajeProducto(
              producto.nombre,
              formatearMoneda(producto.precio),
            )}
            disabled={compartirDeshabilitado}
            disabledReason={motivoCompartirDeshabilitado}
            label="Compartir"
            variant="outline"
            size="sm"
          />
        </SheetHeader>

        {isErrorDetalle ? (
          <div className="flex-1 flex items-center justify-center text-sm text-destructive p-8 text-center">
            No se pudo cargar el producto. Cerrá e intentá de nuevo.
          </div>
        ) : !detalle || isLoadingDetalle ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando producto...
          </div>
        ) : (
          <EditProductForm
            key={detalle.id}
            producto={detalle}
            onSaved={() => setOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

type EditableProducto = Producto & {
  categoria_id?: string | null;
};

function EditProductForm({
  producto,
  onSaved,
}: Readonly<{
  producto: EditableProducto;
  onSaved: () => void;
}>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isSimpleProduct = isSingleVariantProduct(producto);
  // Fuente única de verdad para reconstruir opciones/variantes al cargar:
  // prioriza producto_variantes (nombres de atributo reales) y limpia
  // formatos legacy tipo "TALLE: L" antes de repartirlos en el form.
  const parsedProducto = useMemo(
    () => parseLegacyVariant(producto, isSimpleProduct),
    [producto, isSimpleProduct],
  );

  const [archivos, setArchivos] = useState<File[]>([]);
  // Espejo local de imagen_url — arranca desde el producto cargado, pero
  // se actualiza apenas el servidor confirma un guardado de imágenes
  // exitoso (ver el success handler de formAction más abajo). Es la
  // fuente para "imágenes existentes" en vez de producto.imagen_url
  // directo: si el guard de variantes bloquea y el usuario reintenta
  // después de corregir, esto evita que el formulario crea que las fotos
  // ya guardadas siguen pendientes y las vuelva a subir — la causa exacta
  // de la duplicación del incidente original.
  const [imagenesActuales, setImagenesActuales] = useState<string[]>(() =>
    parseProductImages(producto.imagen_url),
  );
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
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(
    null,
  );
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

  const [, formAction, isPending] = useActionState(
    async (
      prevState: EditarProductoResult,
      formData: FormData,
    ): Promise<EditarProductoResult> => {
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

      if (result.imagenes.success) {
        // Las fotos ya quedaron guardadas en el servidor — sincronizamos
        // el estado local ANTES de cualquier posible reintento (ej. si
        // las variantes se bloquean y el usuario corrige y vuelve a
        // guardar) para no volver a subir los mismos binarios ni volver a
        // pedir el borrado de fotos que ya no existen.
        setArchivos([]);
        setImagenesExistentesAQuitar([]);
        if (result.imagenes.urls?.imagen_url !== undefined) {
          setImagenesActuales(
            parseProductImages(result.imagenes.urls.imagen_url),
          );
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.stock.index });
        queryClient.invalidateQueries({ queryKey: queryKeys.pos.productos });
        queryClient.invalidateQueries({
          queryKey: queryKeys.stock.detalle(producto.id),
        });
        router.refresh();
      }

      if (result.imagenes.success && result.variantes.success) {
        toast.success("Producto actualizado");
        onSaved();
      } else {
        // Éxito parcial o falla total: cada parte informa por su cuenta,
        // el sheet se queda abierto para que se pueda corregir y
        // reintentar sin perder lo que ya se guardó.
        if (result.imagenes.success) {
          toast.success("Fotos guardadas.");
        } else if (result.imagenes.error) {
          toast.error(`No se pudieron guardar las fotos: ${result.imagenes.error}`);
        }
        if (!result.variantes.success && result.variantes.error) {
          toast.error(result.variantes.error);
        }
      }

      return result;
    },
    { imagenes: { success: false }, variantes: { success: false } },
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
        archivos.map((file) => optimizarImagenProducto(file)),
      );

      // Desestructuramos el main, el thumbnail y el grid de cada iteración
      imagenesOptimizadas.forEach(({ main, thumbnail, grid }) => {
        formData.append("imagenes", main);
        formData.append("thumbnails", thumbnail);
        formData.append("grids", grid);
      });

      setIsCompressing(false);
    }

    if (showVariants) {
      await abrirConfirmacionVariantes(formData);
    } else {
      startTransition(() => formAction(formData));
    }
  };

  const abrirConfirmacionVariantes = async (formData: FormData) => {
    setPendingFormData(formData);
    setConfirmModalOpen(true);
    setIsLoadingDiff(true);

    // Re-fetch obligatorio contra la base real al momento de confirmar —
    // NUNCA contra el estado local del form, que puede haber perdido una
    // combinación sin que nadie lo note (el caso exacto del incidente que
    // originó este modal). Columnas acotadas a lo que el diff usa.
    const supabase = createClient();
    const { data: existentes } = await supabase
      .from("producto_variantes")
      .select("nombre_display, atributos, precio, stock")
      .eq("producto_id", producto.id);

    // .key ya viene calculado por buildCartesianVariants/parseLegacyVariant
    // — no hace falta recalcularlo acá.
    const formVariantesPorKey = new Map(
      variantSelection.variantes.map((v) => [v.key, v]),
    );
    const existentesPorKey = new Map(
      (existentes ?? []).map((ex) => [
        buildVariantKey((ex.atributos as Record<string, string>) ?? {}),
        ex,
      ]),
    );

    // Pasada 1: lo que hoy existe en base — eliminadas (no está en el
    // payload) y modificadas (stock o precio distinto).
    const filasEliminadasYModificadas: VarianteDiffRow[] = [];
    existentesPorKey.forEach((ex, key) => {
      const atributos = (ex.atributos as Record<string, string>) ?? {};
      const atributosLabel =
        Object.entries(atributos)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" / ") ||
        ex.nombre_display ||
        "Variante";
      const precioAntes = ex.precio ? Number(ex.precio) : null;
      const enPayload = formVariantesPorKey.get(key);

      if (!enPayload) {
        filasEliminadasYModificadas.push({
          key,
          atributosLabel,
          tipo: "eliminada",
          stockAntes: ex.stock,
          stockDespues: null,
          precioAntes,
          precioDespues: null,
        });
        return;
      }

      const stockDespues = enPayload.stock?.trim()
        ? Number.parseInt(enPayload.stock)
        : ex.stock;
      const precioDespues = enPayload.precio?.trim()
        ? Number.parseFloat(enPayload.precio)
        : null;

      // Ocultamos del todo lo que no cambia: solo lo que realmente va a
      // moverse merece la atención del usuario.
      if (ex.stock !== stockDespues || precioAntes !== precioDespues) {
        filasEliminadasYModificadas.push({
          key,
          atributosLabel,
          tipo: "modificada",
          stockAntes: ex.stock,
          stockDespues,
          precioAntes,
          precioDespues,
        });
      }
    });

    // Pasada 2: lo que trae el payload y no existe en base todavía.
    const filasNuevas: VarianteDiffRow[] = [];
    formVariantesPorKey.forEach((v, key) => {
      if (existentesPorKey.has(key)) return;
      filasNuevas.push({
        key,
        atributosLabel:
          Object.entries(v.valores)
            .map(([k, val]) => `${k}: ${val}`)
            .join(" / ") || "Variante",
        tipo: "nueva",
        stockAntes: null,
        stockDespues: v.stock?.trim() ? Number.parseInt(v.stock) : 0,
        precioAntes: null,
        precioDespues: v.precio?.trim() ? Number.parseFloat(v.precio) : null,
      });
    });

    const filas = [...filasEliminadasYModificadas, ...filasNuevas];

    // Si de verdad no cambia nada, el modal no aporta nada — guardamos
    // directo en vez de mostrar una tabla vacía sin explicación.
    if (filas.length === 0) {
      setConfirmModalOpen(false);
      setIsLoadingDiff(false);
      setPendingFormData(null);
      startTransition(() => formAction(formData));
      return;
    }

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
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
        <form
          onSubmit={handleSubmit}
          id="edit-product-form"
          className="max-w-3xl mx-auto space-y-6"
        >
          <ProductMediaSection
            archivos={archivos}
            onArchivosChange={setArchivos}
            existingImages={imagenesActuales.filter(
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
            resetOpciones={variantSelection.reset}
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
            atributosExistentes={variantSelection.atributosExistentes}
          />
        </form>
      </div>

      <CreateProductFooter
        isPending={isPending}
        isCompressing={isCompressing}
        onCancel={onSaved}
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
