"use client";

import { useRef, useState } from "react";
import { useSlugNegocioActivo } from "@/shared/components/negocio-activo-provider";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ClipboardList,
  FileSpreadsheet,
  Filter,
  FilterX,
  FolderOpen,
  LayoutGrid,
  List,
  MoreHorizontal,
  PackagePlus,
  Plus,
  ScanBarcode,
  Search,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { ImportarPedidoModal } from "@/features/purchases/ui/create-purchase-modal";
import { CrearProductoSheet } from "@/features/stock/ui/create-sheet";
import { ImportProductosModal } from "./import-productos-modal";
import { UpdatePricesModal } from "./update-prices-modal";
import { PriceHistoryModal } from "./price-history-modal";
import { ShareButton } from "@/shared/components/share-button";
import {
  armarMensajeCategoria,
  construirUrlCategoria,
} from "@/shared/utils/compartir-catalogo";

export type CategoriaToolbarHijo = { nombre: string; value: string; count: number };

export type CategoriaToolbar = CategoriaToolbarHijo & {
  /** Presente y no-vacío = esta categoría es un "padre" — al seleccionarla
   * o seleccionar uno de sus hijos, la barra pasa a modo nivel 2. */
  hijos?: CategoriaToolbarHijo[];
};

interface StockFiltersToolbarProps {
  view: "table" | "grid";
  onViewChange: (view: "table" | "grid") => void;
  showViewToggle?: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoriaActiva: string;
  onCategoriaChange: (categoria: string) => void;
  categoriasDisponibles: CategoriaToolbar[];
  totalProductos: number;
  hayFiltrosActivos: boolean;
  propiedadesGlobales: Record<string, string[]>;
  filtrosVariantes: Record<string, string | string[]>;
  onFiltroVarianteChange: (propiedad: string, valor: string) => void;
  isAdmin: boolean;
  onLimpiarFiltros: () => void;
  slugCategoriaActiva?: string | null;
  nombreCategoriaActiva?: string;
  nombreComercio?: string;
  /** Búsqueda transversal: cuántos resultados matchean búsqueda/variante
   * FUERA de la categoría activa — "ver N más en todo el stock/catálogo". */
  resultadosFueraDeCategoria?: number;
}

export function StockFiltersToolbar({
  view,
  onViewChange,
  showViewToggle = true,
  searchQuery,
  onSearchChange,
  categoriaActiva,
  onCategoriaChange,
  categoriasDisponibles,
  totalProductos,
  hayFiltrosActivos,
  propiedadesGlobales,
  filtrosVariantes,
  onFiltroVarianteChange,
  isAdmin,
  onLimpiarFiltros,
  slugCategoriaActiva,
  nombreCategoriaActiva,
  nombreComercio = "Tienda",
  resultadosFueraDeCategoria = 0,
}: Readonly<StockFiltersToolbarProps>) {
  // El link del catálogo necesita el negocio, no solo el origen: cada
  // comercio tiene su propia tienda.
  const slugNegocio = useSlugNegocioActivo() ?? "";
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  // El sheet de carga manual se monta UNA vez y se abre desde dos botones
  // distintos según breakpoint (barra en desktop, dropdown en mobile).
  const [isCrearProductoOpen, setIsCrearProductoOpen] = useState(false);
  const [isImportProductosOpen, setIsImportProductosOpen] = useState(false);
  const seImportoAlgo = useRef(false);
  const propiedadesVariantes = Object.entries(propiedadesGlobales);
  const hayFiltrosVariantesActivos = Object.values(filtrosVariantes).some(
    (valor) => (Array.isArray(valor) ? valor.length > 0 : valor !== "todos"),
  );

  const limpiarFiltrosVariantes = () => {
    propiedadesVariantes.forEach(([propiedad]) => {
      onFiltroVarianteChange(propiedad, "todos");
    });
    onLimpiarFiltros();
  };

  return (
    <>
      {/* 1. BARRA SUPERIOR: Buscador y Acciones */}
      <div className="flex flex-row gap-2 px-2 py-1.5 border-b border-border">
        <ImportarPedidoModal
          open={isImportModalOpen}
          onOpenChange={setIsImportModalOpen}
          hideTrigger
        />

        {isAdmin && (
          <CrearProductoSheet
            open={isCrearProductoOpen}
            onOpenChange={setIsCrearProductoOpen}
            hideTrigger
          />
        )}

        {isAdmin && (
          <ImportProductosModal
            open={isImportProductosOpen}
            // El refresh se difiere al cierre a propósito: recargar apenas
            // termina de escribir se llevaría por delante el reporte fila
            // por fila, que es justo lo que hay que leer cuando alguna falló.
            onOpenChange={(open) => {
              setIsImportProductosOpen(open);
              if (!open && seImportoAlgo.current) window.location.reload();
            }}
            onImportado={() => {
              seImportoAlgo.current = true;
            }}
          />
        )}

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              className="pl-9 h-10 text-sm rounded-lg border-border bg-muted w-full"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="relative h-10 w-10 p-0 shrink-0 border-border/60 bg-background"
                aria-label="Abrir filtros de variantes"
              >
                <Filter className="h-4 w-4" />
                {hayFiltrosVariantesActivos && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
                )}
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full sm:max-w-sm p-0 gap-0">
              <SheetHeader className="p-5 border-b border-border text-left">
                <SheetTitle>Filtros de Variantes</SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {propiedadesVariantes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay variantes disponibles para filtrar.
                  </p>
                ) : (
                  propiedadesVariantes.map(([propName, valores]) => (
                    <div key={propName} className="space-y-3">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {propName}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {["todos", ...valores].map((valor) => {
                          const seleccion = filtrosVariantes[propName];
                          const isActive = Array.isArray(seleccion)
                            ? valor === "todos"
                              ? seleccion.length === 0
                              : seleccion.includes(valor)
                            : (seleccion || "todos") === valor;
                          const label =
                            valor === "todos" ? "Cualquiera" : valor;

                          return (
                            <button
                              key={valor}
                              type="button"
                              onClick={() =>
                                onFiltroVarianteChange(propName, valor)
                              }
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                isActive
                                  ? "border-primary bg-primary text-white ring-2 ring-primary/30"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {isActive && valor !== "todos" && (
                                <Check className="inline w-3 h-3 mr-1 -mt-0.5" />
                              )}
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <SheetFooter className="border-t border-border bg-card p-4">
                <Button
                  variant="outline"
                  onClick={limpiarFiltrosVariantes}
                  className="w-full"
                >
                  Limpiar Filtros
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* Controles y Botonera Admin (No se encoge nunca en mobile) */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Carga rápida — visible para todos los roles, no solo Admin. En
              mobile no vive acá sino dentro del dropdown de acciones: al lado
              del buscador no entraba sin comerle ancho. */}
          <Link href="/stock/carga-rapida" className="hidden sm:block">
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-10 sm:w-auto p-0 sm:px-3 shrink-0 border-border/60 bg-background"
              title="Carga rápida de mercadería"
            >
              <ScanBarcode className="h-4 w-4 sm:mr-2 text-muted-foreground" />
              <span className="hidden sm:inline font-semibold">
                Carga rápida
              </span>
            </Button>
          </Link>

          {/* Toggle View (Oculto en celular para ahorrar valioso espacio) */}
          {showViewToggle && (
            <div className="hidden sm:flex items-center bg-muted border border-border/80 p-0.5 rounded-lg shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewChange("table")}
                className={`h-8 px-2.5 rounded-md ${view === "table" ? "bg-background font-bold" : "text-muted-foreground hover:text-foreground"}`}
                title="Vista de lista"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewChange("grid")}
                className={`h-8 px-2.5 rounded-md ${view === "grid" ? "bg-background font-bold" : "text-muted-foreground hover:text-foreground"}`}
                title="Vista de grilla (agrupada)"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Botonera de Acciones. El dropdown NO está gateado por isAdmin
              porque en mobile es el único acceso a Carga rápida, que es para
              todos los roles; para un vendedor el menú tiene solo esa entrada
              y por eso se oculta en desktop (ahí ya tiene su botón propio). */}
          <div className="flex items-center gap-1.5 sm:gap-2 sm:ml-2 sm:pl-4 sm:border-l sm:border-border shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-10 w-10 sm:w-auto bg-background border-border/60 hover:bg-muted text-foreground p-0 sm:px-3 cursor-pointer shrink-0 ${
                    isAdmin ? "" : "sm:hidden"
                  }`}
                >
                  <MoreHorizontal className="h-4 w-4 sm:mr-2 text-muted-foreground" />
                  <span className="hidden sm:inline font-semibold">
                    Acciones
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 p-1.5 rounded-xl border-border/60 shadow-lg bg-card z-50"
              >
                <div className="flex flex-col gap-0.5 [&_button]:w-full [&_button]:justify-start [&_button]:h-9 [&_button]:px-2 [&_button]:bg-transparent [&_button]:border-0 [&_button]:shadow-none [&_button]:font-medium [&_button]:text-sm [&_button:hover]:bg-muted [&_button]:rounded-md [&_button_span.hidden]:!inline-block [&_button_svg]:mr-2 [&_button_svg]:w-4 [&_button_svg]:h-4 [&_button_svg]:shrink-0">
                  {/* Las dos cargas solo aparecen acá en mobile: en desktop
                      siguen siendo botones sueltos de la barra. */}
                  <Link
                    href="/stock/carga-rapida"
                    className="w-full block sm:hidden"
                  >
                    <button className="w-full flex items-center justify-start h-9 px-2 text-sm font-medium cursor-pointer text-foreground hover:bg-muted rounded-md transition-colors">
                      <ScanBarcode className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
                      Carga rápida
                    </button>
                  </Link>

                  {isAdmin && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        className="sm:hidden"
                        onClick={() => setIsCrearProductoOpen(true)}
                      >
                        <Plus className="w-4 h-4 mr-2 text-primary shrink-0" />
                        <span>Carga manual</span>
                      </Button>
                      <DropdownMenuSeparator className="my-1 bg-border/60 sm:hidden" />
                    </>
                  )}

                  {isAdmin && (
                    <>
                      <UpdatePricesModal />
                      <PriceHistoryModal />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsImportModalOpen(true)}
                      >
                        <PackagePlus className="w-4 h-4 mr-2 text-success shrink-0" />
                        <span>Ingresar Remito</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsImportProductosOpen(true)}
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2 text-success shrink-0" />
                        <span>Importar Planilla</span>
                      </Button>
                      <DropdownMenuSeparator className="my-1 bg-border/60" />
                      <Link href="/stock/bajas" className="w-full block">
                        <button className="w-full flex items-center justify-start h-9 px-2 text-sm font-medium text-foreground hover:bg-warning/10 rounded-md hover:text-warning/90 transition-colors">
                          <ClipboardList className="w-4 h-4 mr-2 text-warning shrink-0" />
                          Bajas de Inventario
                        </button>
                      </Link>
                      <Link href="/stock/movimientos" className="w-full block">
                        <button className="w-full flex items-center justify-start h-9 px-2 text-sm font-medium text-foreground hover:bg-muted rounded-md transition-colors">
                          <ArrowRightLeft className="w-4 h-4 mr-2 text-primary shrink-0" />
                          Movimientos Stock
                        </button>
                      </Link>
                    </>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Carga manual en desktop: mismo sheet, otro disparador. */}
            {isAdmin && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCrearProductoOpen(true)}
                className="hidden sm:flex h-10 px-4 shrink-0"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span>Nuevo Producto</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 2. BARRA DE CATEGORÍAS DINÁMICAS Y LIMPIEZA — tolerante a árbol
      mixto: si ningún elemento de categoriasDisponibles trae `hijos`, esto
      degrada exactamente a la fila plana de siempre. */}
      {(() => {
        const padreEnVista = categoriasDisponibles.find((c) => {
          if (!c.hijos || c.hijos.length === 0) return false;
          if (c.value === categoriaActiva) return true;
          return c.hijos.some((h) => h.value === categoriaActiva);
        });

        return (
          <div className="flex w-full min-w-0 items-start gap-2 overflow-hidden mt-4 md:mt-2 px-2">
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-2 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-1 sm:px-0">
              {padreEnVista ? (
                <>
                  <Button
                    variant="outline"
                    className="rounded-full h-10 md:h-8 px-4 text-xs font-semibold shrink-0 shadow-none border-border/60 sticky left-0 bg-background gap-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onCategoriaChange("todos")}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    {padreEnVista.nombre}
                  </Button>

                  {padreEnVista.hijos!.map((hijo) => {
                    const isActive = categoriaActiva === hijo.value;
                    return (
                      <Button
                        key={hijo.value}
                        variant={isActive ? "default" : "outline"}
                        className={`rounded-full h-10 md:h-8 px-4 text-xs font-semibold shrink-0 transition-colors shadow-none border-border/60 ${
                          isActive
                            ? "bg-foreground text-background border-transparent"
                            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        onClick={() => onCategoriaChange(hijo.value)}
                      >
                        {hijo.nombre} ({hijo.count})
                      </Button>
                    );
                  })}

                  <Button
                    variant={categoriaActiva === padreEnVista.value ? "default" : "outline"}
                    className={`rounded-full h-10 md:h-8 px-4 text-xs font-semibold shrink-0 transition-colors shadow-none border-border/60 ${
                      categoriaActiva === padreEnVista.value
                        ? "bg-foreground text-background border-transparent"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    onClick={() => onCategoriaChange(padreEnVista.value)}
                  >
                    Todo {padreEnVista.nombre}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={categoriaActiva === "todos" ? "default" : "outline"}
                    className={`rounded-full h-10 md:h-8 px-4 text-xs font-semibold shrink-0 shadow-none border-border/60 ${
                      categoriaActiva === "todos"
                        ? "bg-foreground text-background border-transparent"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    onClick={() => onCategoriaChange("todos")}
                  >
                    Todas ({totalProductos})
                  </Button>

                  {categoriasDisponibles.map((categoria) => {
                    const esPadre = (categoria.hijos?.length ?? 0) > 0;
                    const isActive =
                      categoriaActiva.toLowerCase() === categoria.value.toLowerCase();

                    return (
                      <Button
                        key={categoria.value}
                        variant="outline"
                        className={`rounded-full h-10 md:h-8 px-4 text-xs font-semibold shrink-0 transition-colors shadow-none gap-1.5 ${
                          esPadre
                            ? "border-primary/30 bg-background text-foreground font-bold hover:bg-primary/10"
                            : isActive
                              ? "bg-foreground text-background border-transparent"
                              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground border-border/60"
                        }`}
                        onClick={() => onCategoriaChange(categoria.value)}
                      >
                        {esPadre && <FolderOpen className="w-3.5 h-3.5 text-primary" />}
                        {categoria.nombre} ({categoria.count})
                      </Button>
                    );
                  })}
                </>
              )}
            </div>

            {resultadosFueraDeCategoria > 0 && categoriaActiva !== "todos" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCategoriaChange("todos")}
                className="h-8 mt-0 text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0 hidden sm:flex items-center"
              >
                Ver {resultadosFueraDeCategoria} más
              </Button>
            )}

            {slugCategoriaActiva && (
              <ShareButton
                url={construirUrlCategoria(slugNegocio, slugCategoriaActiva)}
                title={`${nombreCategoriaActiva} | ${nombreComercio}`}
                text={armarMensajeCategoria(nombreCategoriaActiva || "")}
                label="Compartir esta categoría"
                variant="outline"
                size="sm"
                className="h-8 mt-0 text-xs font-bold shrink-0 hidden sm:flex items-center bg-background"
              />
            )}

            {/* Botón de limpiar filtros si están activos */}
            {hayFiltrosActivos && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLimpiarFiltros}
                className="h-8 mt-0 text-xs font-bold text-muted-foreground hover:text-foreground shrink-0 hidden sm:flex items-center"
              >
                <FilterX className="w-3.5 h-3.5 mr-1.5" /> Limpiar
              </Button>
            )}
          </div>
        );
      })()}
    </>
  );
}
