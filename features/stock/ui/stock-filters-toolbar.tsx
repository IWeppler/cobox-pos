"use client";

import Link from "next/link";
import {
  ClipboardList,
  FilterX,
  LayoutGrid,
  List,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { ImportarPedidoModal } from "@/features/purchases/ui/create-purchase-modal";
import { CrearProductoSheet } from "@/features/stock/ui/create-sheet";
import { UpdatePricesModal } from "./update-prices-modal";

type CategoriaToolbar =
  | string
  | {
      nombre: string;
      value: string;
      count: number;
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
  conteosPorCategoria: Record<string, number>;
  totalProductos: number;
  hayFiltrosActivos: boolean;
  isAdmin: boolean;
  onLimpiarFiltros: () => void;
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
  conteosPorCategoria,
  totalProductos,
  hayFiltrosActivos,
  isAdmin,
  onLimpiarFiltros,
}: Readonly<StockFiltersToolbarProps>) {
  return (
    <>
      {/* 1. BARRA SUPERIOR: Buscador y Acciones */}
      <div className="flex flex-row gap-2 sm:gap-4 justify-between items-center bg-card p-2 sm:p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            className="pl-9 h-10 text-sm rounded-lg border-border bg-muted w-full"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Controles y Botonera Admin (No se encoge nunca en mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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

          {/* Botonera de Acciones Admin */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 sm:gap-2 sm:ml-2 sm:pl-4 sm:border-l sm:border-border shrink-0">
              {/* Opciones Secundarias en Dropdown (Icono en Mobile, Texto en Desktop) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 sm:w-auto bg-background border-border/60 hover:bg-muted text-foreground p-0 sm:px-3 cursor-pointer shrink-0"
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
                    <UpdatePricesModal />
                    <ImportarPedidoModal />
                    <DropdownMenuSeparator className="my-1 bg-border/60" />
                    <Link href="/stock/bajas" className="w-full block">
                      <button className="w-full flex items-center justify-start h-9 px-2 text-sm font-medium cursor-pointer text-amber-700 hover:bg-amber-50 rounded-md hover:text-amber-800 transition-colors">
                        <ClipboardList className="w-4 h-4 mr-2 text-amber-600 shrink-0" />
                        Bajas de Inventario
                      </button>
                    </Link>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="[&_button]:h-10 [&_button]:w-10 sm:[&_button]:w-auto [&_button]:p-0 sm:[&_button]:px-4 [&_button_span]:hidden sm:[&_button_span]:inline [&_button_svg]:mr-0 sm:[&_button_svg]:mr-2 [&_button]:shrink-0">
                <CrearProductoSheet />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. BARRA DE CATEGORÍAS DINÁMICAS Y LIMPIEZA */}
      <div className="flex items-start gap-2 mt-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide flex-1 px-1 sm:px-0">
          <Button
            variant={categoriaActiva === "todos" ? "default" : "outline"}
            className={`rounded-full h-8 px-4 text-xs font-semibold shrink-0 shadow-none border-border/60 ${
              categoriaActiva === "todos"
                ? "bg-foreground text-background border-transparent"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => onCategoriaChange("todos")}
          >
            Todas ({totalProductos})
          </Button>

          {categoriasDisponibles.map((categoria) => {
            const catNombre =
              typeof categoria === "string" ? categoria : categoria.nombre;
            const catValue =
              typeof categoria === "string" ? categoria : categoria.value;
            const count =
              typeof categoria === "string"
                ? conteosPorCategoria[catNombre]
                : categoria.count;
            const isActive =
              categoriaActiva.toLowerCase() === catValue.toLowerCase();

            return (
              <Button
                key={catValue}
                variant={isActive ? "default" : "outline"}
                className={`rounded-full h-8 px-4 text-xs font-semibold shrink-0 transition-colors shadow-none border-border/60 ${
                  isActive
                    ? "bg-foreground text-background border-transparent"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => onCategoriaChange(catValue)}
              >
                {catNombre} ({count})
              </Button>
            );
          })}
        </div>

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
    </>
  );
}
