"use client";

import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { useCreateProductForm } from "../hooks/use-create-product-form";
import { CreateProductFooter } from "./create-product/create-product-footer";
import { ProductBasicInfoSection } from "./create-product/product-basic-info-section";
import { ProductCategorySection } from "./create-product/product-category-section";
import { ProductInventorySection } from "./create-product/product-inventory-section";
import { ProductMediaSection } from "./create-product/product-media-section";
import { ProductPriceSection } from "./create-product/product-price-section";
import { ProductVariantsSection } from "./create-product/product-variants-section";

export function CrearProductoSheet() {
  const form = useCreateProductForm();

  return (
    <>
      <Sheet open={form.isOpen} onOpenChange={form.handleOpenChange}>
        <SheetTrigger asChild>
          <Button variant="ghost">
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden md:flex">Nuevo Producto</span>
          </Button>
        </SheetTrigger>

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
                onClick={() => form.handleOpenChange(false)}
                className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <SheetTitle className="text-xl font-bold text-foreground m-0">
                Crear Producto
              </SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-2 md:px-8 py-4">
            <form
              onSubmit={form.handleSubmit}
              id="create-product-form"
              className="max-w-3xl mx-auto space-y-6"
            >
              <ProductMediaSection
                archivos={form.archivos}
                onArchivosChange={form.setArchivos}
              />

              <ProductBasicInfoSection
                status={form.status}
                onStatusChange={form.setStatus}
              />

              <ProductCategorySection
                categorias={form.categorias}
                categoriaSeleccionada={form.categoriaSeleccionada}
                onCategoriaSeleccionadaChange={form.setCategoriaSeleccionada}
              />

              <ProductPriceSection
                showPrice={form.showPrice}
                onShowPriceChange={form.setShowPrice}
                precioCosto={form.precioCosto}
                onPrecioCostoChange={form.setPrecioCosto}
                precioVenta={form.precioVenta}
                onPrecioVentaChange={form.setPrecioVenta}
                gananciaNeta={form.gananciaNeta}
                margenPorcentaje={form.margenPorcentaje}
              />

              <ProductInventorySection
                showVariants={form.showVariants}
                showInventory={form.showInventory}
                onShowInventoryChange={form.setShowInventory}
              />

              <ProductVariantsSection
                showVariants={form.showVariants}
                onShowVariantsChange={form.setShowVariants}
                opciones={form.opciones}
                resetOpciones={() => form.setOpciones([])}
                customTypeMode={form.customTypeMode}
                setCustomTypeMode={form.setCustomTypeMode}
                focusedOptionId={form.focusedOptionId}
                setFocusedOptionId={form.setFocusedOptionId}
                precioVenta={form.precioVenta}
                variantes={form.variantes}
                duplicatePropertyNames={form.duplicatePropertyNames}
                genericPropertyNames={form.genericPropertyNames}
                handleAddOption={form.handleAddOption}
                handleRemoveOption={form.handleRemoveOption}
                handleUpdateOptionName={form.handleUpdateOptionName}
                handleAddOptionValue={form.handleAddOptionValue}
                handleRemoveOptionValue={form.handleRemoveOptionValue}
                handleVarChange={form.handleVarChange}
                getSuggestions={form.getSuggestions}
                baseVariants={form.baseVariants}
                selectedCombinations={form.selectedCombinations}
                onToggleCombination={form.handleToggleCombination}
                onBulkSetSelection={form.handleBulkSetSelection}
                onInvertSelection={form.handleInvertSelection}
                pivotSelections={form.pivotSelections}
                onPivotChange={form.handlePivotChange}
              />
            </form>
          </div>

          <CreateProductFooter
            isPending={form.isPending}
            isCompressing={form.isCompressing}
            onCancel={() => form.handleOpenChange(false)}
            blockedReason={
              form.duplicatePropertyNames.size > 0
                ? "Resolvé los nombres de propiedad duplicados antes de guardar."
                : form.genericPropertyNames.size > 0
                  ? "Renombrá las propiedades con nombre genérico (Propiedad/Opción) antes de guardar."
                  : null
            }
          />
        </SheetContent>
      </Sheet>

    </>
  );
}
