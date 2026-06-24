"use client";

import { useState, useMemo } from "react";
import { Producto } from "@/entities/productos/types";
import { StockTable } from "./stock-table";
import { StockGrid } from "./stock-grid";
import { Button } from "@/shared/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StockFiltersToolbar } from "./stock-filters-toolbar";

interface StockViewProps {
  productos: Producto[];
  userRole: string;
}

export function StockView({ productos, userRole }: Readonly<StockViewProps>) {
  const [view, setView] = useState<"table" | "grid">("table");
  const ITEMS_POR_PAGINA = 10;
  const [paginaActual, setPaginaActual] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("todos");

  const isAdmin = userRole === "ADMIN";

  // Lógica de filtrado por producto adaptada al modelo dinámico
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const matchSearch = p.nombre
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());

      // Intentamos leer la categoría nueva, si no existe usamos el 'tipo' viejo
      const catNombre = p.categoria?.nombre || p.tipo || "Sin categoría";

      const matchCat =
        categoriaActiva === "todos" ||
        catNombre.toLowerCase() === categoriaActiva.toLowerCase();

      return matchSearch && matchCat;
    });
  }, [productos, searchQuery, categoriaActiva]);

  const totalPaginas = Math.ceil(productosFiltrados.length / ITEMS_POR_PAGINA);
  const productosPaginados = productosFiltrados.slice(
    (paginaActual - 1) * ITEMS_POR_PAGINA,
    paginaActual * ITEMS_POR_PAGINA,
  );

  const hayFiltrosActivos = searchQuery !== "" || categoriaActiva !== "todos";

  const conteosPorCategoria = useMemo(() => {
    const conteos: Record<string, number> = {};
    productos.forEach((p) => {
      const cat = p.categoria?.nombre || p.tipo || "Sin categoría";
      conteos[cat] = (conteos[cat] || 0) + 1;
    });
    return conteos;
  }, [productos]);

  const categoriasDisponibles = useMemo(() => {
    return Object.keys(conteosPorCategoria).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
  }, [conteosPorCategoria]);

  const limpiarFiltros = () => {
    setSearchQuery("");
    setCategoriaActiva("todos");
    setPaginaActual(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPaginaActual(1);
  };

  const handleCategoriaChange = (categoria: string) => {
    setCategoriaActiva(categoria);
    setPaginaActual(1);
  };

  return (
    <div className="space-y-4">
      <StockFiltersToolbar
        view={view}
        onViewChange={setView}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        categoriaActiva={categoriaActiva}
        onCategoriaChange={handleCategoriaChange}
        categoriasDisponibles={categoriasDisponibles}
        conteosPorCategoria={conteosPorCategoria}
        totalProductos={productos.length}
        hayFiltrosActivos={hayFiltrosActivos}
        isAdmin={isAdmin}
        onLimpiarFiltros={limpiarFiltros}
      />

      {/* 3. VISTAS */}
      <div className="bg-background rounded-xl border border-border overflow-hidden min-h-100">
        {view === "table" ? (
          <StockTable productos={productosPaginados} userRole={userRole} />
        ) : (
          <StockGrid productos={productosPaginados} userRole={userRole} />
        )}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4 border-t border-border mt-4">
          <span className="text-xs font-medium text-muted-foreground">
            Mostrando{" "}
            {Math.min(
              productosFiltrados.length,
              (paginaActual - 1) * ITEMS_POR_PAGINA + 1,
            )}{" "}
            a{" "}
            {Math.min(
              productosFiltrados.length,
              paginaActual * ITEMS_POR_PAGINA,
            )}{" "}
            de {productosFiltrados.length} productos
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 shadow-none"
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
            >
              <ChevronLeft className="w-4 h-4 sm:mr-1" />{" "}
              <span className="hidden sm:inline">Anterior</span>
            </Button>
            <div className="text-xs font-bold px-3">
              {paginaActual} / {totalPaginas}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shadow-none"
              onClick={() =>
                setPaginaActual((p) => Math.min(totalPaginas, p + 1))
              }
              disabled={paginaActual === totalPaginas}
            >
              <span className="hidden sm:inline">Siguiente</span>{" "}
              <ChevronRight className="w-4 h-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
