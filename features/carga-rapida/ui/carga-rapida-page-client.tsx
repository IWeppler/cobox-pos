"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, Percent } from "lucide-react";
import { Producto } from "@/entities/productos/types";
import type { Rubro } from "@/entities/config/types";
import { Input } from "@/shared/ui/input";
import { QuickAddModal } from "@/features/pos/ui/quick-add-modal";
import { useCargaRapida } from "../hooks/use-carga-rapida";
import { CargaRapidaInput } from "./carga-rapida-input";
import { CargaRapidaLista } from "./carga-rapida-lista";
import { CargaRapidaProductoPicker } from "./carga-rapida-producto-picker";
import { CargaRapidaMaestroPicker } from "./carga-rapida-maestro-picker";
import { CargaRapidaQuickCreateModal } from "./carga-rapida-quick-create-modal";

interface CargaRapidaPageClientProps {
  productosIniciales: Producto[];
  rubro: Rubro;
}

export function CargaRapidaPageClient({
  productosIniciales,
  rubro,
}: Readonly<CargaRapidaPageClientProps>) {
  const {
    lineas,
    query,
    setQuery,
    procesarEnter,
    pickerCandidatos,
    onCancelarPicker,
    onSeleccionarProducto,
    variantSelectorProducto,
    onCerrarVariantSelector,
    onSeleccionarVariante,
    maestroCandidatos,
    onElegirCandidatoMaestro,
    onCargarManualDesdeMaestro,
    resolviendoCandidato,
    altaRapida,
    onCancelarAltaRapida,
    onGuardarAltaRapida,
    onEditarLineaNueva,
    updateCantidad,
    updatePrecioLinea,
    removeLinea,
    confirmar,
    isConfirming,
    buscandoEnMaestro,
    inputRef,
    modalAbierto,
    recargoGlobal,
    setRecargoGlobal,
  } = useCargaRapida(productosIniciales, rubro);

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-2 py-2">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Link
          href="/stock"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-sm font-medium text-foreground">
            Carga rápida de mercadería
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escaneá o escribí, Enter agrega a la lista, confirmá todo junto.
          </p>
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <Percent className="w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="number"
            min={0}
            step="1"
            placeholder="Recargo %"
            value={recargoGlobal}
            onChange={(e) =>
              setRecargoGlobal(e.target.value ? Number(e.target.value) : "")
            }
            className="w-24 h-8 text-xs"
            title="Recargo global para calcular el precio de venta de productos nuevos sin precio cargado. No se guarda, es solo para esta sesión."
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <CargaRapidaInput
          value={query}
          onChange={setQuery}
          onEnter={procesarEnter}
          // Durante la consulta al maestro el input queda bloqueado: si no,
          // un segundo escaneo de la pickeadora entra mientras vuelve la red
          // y pisa el alta que está por abrirse.
          disabled={modalAbierto || buscandoEnMaestro}
          inputRef={inputRef}
        />
        {buscandoEnMaestro ? (
          <p className="flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Buscando en el Catálogo Maestro…
          </p>
        ) : null}
      </div>

      <CargaRapidaLista
        lineas={lineas}
        onUpdateCantidad={updateCantidad}
        onUpdatePrecio={updatePrecioLinea}
        onRemove={removeLinea}
        onEditarNueva={onEditarLineaNueva}
        onConfirmar={confirmar}
        isConfirming={isConfirming}
      />

      <CargaRapidaProductoPicker
        candidatos={pickerCandidatos}
        onCancelar={onCancelarPicker}
        onSeleccionar={onSeleccionarProducto}
      />

      <QuickAddModal
        producto={variantSelectorProducto}
        isOpen={variantSelectorProducto !== null}
        onClose={onCerrarVariantSelector}
        permitirVentaSinStock
        onSelectVariante={onSeleccionarVariante}
      />

      <CargaRapidaMaestroPicker
        candidatos={maestroCandidatos?.lista ?? null}
        query={maestroCandidatos?.query ?? ""}
        resolviendoId={resolviendoCandidato}
        onElegir={onElegirCandidatoMaestro}
        onCargarManual={onCargarManualDesdeMaestro}
      />

      <CargaRapidaQuickCreateModal
        altaRapida={altaRapida}
        recargoGlobal={recargoGlobal}
        onCancelar={onCancelarAltaRapida}
        onGuardar={onGuardarAltaRapida}
      />
    </div>
  );
}
