"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Producto, ProductoIndice } from "@/entities/productos/types";
import {
  buildPropiedadesFiltro,
  resolverAtributosVariante,
} from "@/entities/productos/lib/build-propiedades-filtro";
import { StockTable } from "./stock-table";
import { StockGrid } from "./stock-grid";
import { Button } from "@/shared/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StockFiltersToolbar } from "./stock-filters-toolbar";
import { getStockPageDetailAction } from "../actions/get-product";
import { getTotalStock } from "../lib/stock-product-utils";

interface StockViewProps {
  productosIndice: ProductoIndice[];
  userRole: string;
  nombreComercio: string;
  mostrarSinStock: boolean;
}

const ITEMS_POR_PAGINA = 10;
const SEARCH_DEBOUNCE_MS = 300;

export function StockView({
  // page.tsx (Server Component) ya se revalida solo en cada alta/edición/
  // baja de producto (revalidatePath("/stock") desde las actions) — esta
  // prop llega con datos frescos en cada una de esas revalidaciones, así
  // que se usa directo, sin copiarla a un estado local que haya que andar
  // resincronizando.
  productosIndice,
  userRole,
  nombreComercio,
  mostrarSinStock,
}: Readonly<StockViewProps>) {
  const [view, setView] = useState<"table" | "grid">("table");
  const [paginaActual, setPaginaActual] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("todos");
  const [filtrosVariantes, setFiltrosVariantes] = useState<
    Record<string, string>
  >({});
  const [orden, setOrden] = useState("nombre_asc");

  const isAdmin = userRole === "ADMIN";

  // La búsqueda dispara un fetch de detalle por cambio — sin debounce,
  // escribir "vestido" dispararía 7 round-trips. La caja de texto sigue
  // respondiendo al instante (searchQuery), el filtrado usa la versión
  // debounced.
  useEffect(() => {
    const timer = setTimeout(
      () => setSearchDebounced(searchQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Misma lógica de filtrado de siempre (buildPropiedadesFiltro /
  // resolverAtributosVariante no cambiaron), corriendo ahora sobre el
  // índice liviano en vez del catálogo completo con todas las columnas.
  const propiedadesGlobales = useMemo(
    () =>
      buildPropiedadesFiltro(productosIndice, {
        incluirFallbackRelacional: true,
      }),
    [productosIndice],
  );

  const productosFiltrados = useMemo(() => {
    return productosIndice.filter((p) => {
      const matchSearch = p.nombre
        ?.toLowerCase()
        .includes(searchDebounced.toLowerCase());

      const catNombre = p.categoria?.nombre || p.tipo || "Sin categoría";

      const matchCat =
        categoriaActiva === "todos" ||
        catNombre.toLowerCase() === categoriaActiva.toLowerCase();

      const matchVariantes = Object.entries(filtrosVariantes).every(
        ([propiedad, valor]) => {
          if (valor === "todos") return true;

          return (
            p.producto_variantes?.some((variante) => {
              const atributos = resolverAtributosVariante(variante, {
                incluirFallbackRelacional: true,
              });
              return (
                atributos[propiedad]?.toLowerCase() === valor.toLowerCase()
              );
            }) ?? false
          );
        },
      );

      return matchSearch && matchCat && matchVariantes;
    });
  }, [productosIndice, searchDebounced, categoriaActiva, filtrosVariantes]);

  // El sort corre acá, sobre TODO el set filtrado, antes de paginar. Antes
  // vivía adentro de stock-table.tsx y solo reordenaba los 10 productos de
  // la página visible — cambiar de página no respetaba el orden elegido.
  const productosOrdenados = useMemo(() => {
    const arr = [...productosFiltrados];
    arr.sort((a, b) => {
      switch (orden) {
        case "nombre_asc":
          return a.nombre.localeCompare(b.nombre);
        case "nombre_desc":
          return b.nombre.localeCompare(a.nombre);
        case "stock_desc":
          return getTotalStock(b) - getTotalStock(a);
        case "stock_asc":
          return getTotalStock(a) - getTotalStock(b);
        case "costo_desc":
          return (b.precio_costo || 0) - (a.precio_costo || 0);
        case "costo_asc":
          return (a.precio_costo || 0) - (b.precio_costo || 0);
        case "precio_desc":
          return b.precio - a.precio;
        case "precio_asc":
          return a.precio - b.precio;
        case "categoria_asc":
          return (a.tipo || "").localeCompare(b.tipo || "");
        case "categoria_desc":
          return (b.tipo || "").localeCompare(a.tipo || "");
        default:
          return 0;
      }
    });
    return arr;
  }, [productosFiltrados, orden]);

  const totalPaginas = Math.ceil(productosOrdenados.length / ITEMS_POR_PAGINA);

  const idsPaginaActual = useMemo(
    () =>
      productosOrdenados
        .slice(
          (paginaActual - 1) * ITEMS_POR_PAGINA,
          paginaActual * ITEMS_POR_PAGINA,
        )
        .map((p) => p.id),
    [productosOrdenados, paginaActual],
  );

  const [productosPagina, setProductosPagina] = useState<Producto[]>([]);
  const [isLoadingPagina, setIsLoadingPagina] = useState(false);
  const cicloRef = useRef(0);

  useEffect(() => {
    const cicloId = ++cicloRef.current;

    const cargarPagina = async () => {
      setIsLoadingPagina(true);
      const { data, error } = await getStockPageDetailAction(idsPaginaActual);

      // Se descarta cualquier respuesta que no sea la del último ciclo
      // disparado, sin importar el orden real de llegada por red — así
      // escribir/borrar/escribir en el buscador con mala conexión nunca
      // deja la tabla mostrando resultados de una búsqueda vieja con el
      // texto nuevo ya en la caja.
      if (cicloId !== cicloRef.current) return;
      setIsLoadingPagina(false);

      if (error || !data) {
        toast.error(error || "No se pudieron cargar los productos.");
        return;
      }
      setProductosPagina(data);
    };

    cargarPagina();
  }, [idsPaginaActual]);

  const hayFiltrosActivos =
    searchQuery !== "" ||
    categoriaActiva !== "todos" ||
    Object.values(filtrosVariantes).some((valor) => valor !== "todos");

  const conteosPorCategoria = useMemo(() => {
    const conteos: Record<string, number> = {};
    productosIndice.forEach((p) => {
      const cat = p.categoria?.nombre || p.tipo || "Sin categoría";
      conteos[cat] = (conteos[cat] || 0) + 1;
    });
    return conteos;
  }, [productosIndice]);

  const categoriasDisponibles = useMemo(() => {
    return Object.keys(conteosPorCategoria).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
  }, [conteosPorCategoria]);

  const slugCategoriaActiva = useMemo(() => {
    if (categoriaActiva === "todos") return null;
    const producto = productosIndice.find(
      (p) =>
        (p.categoria?.nombre || p.tipo || "Sin categoría").toLowerCase() ===
        categoriaActiva.toLowerCase(),
    );
    return producto?.categoria?.slug ?? null;
  }, [productosIndice, categoriaActiva]);

  const limpiarFiltros = () => {
    setSearchQuery("");
    setCategoriaActiva("todos");
    setFiltrosVariantes({});
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

  const handleFiltroVarianteChange = (propiedad: string, valor: string) => {
    setFiltrosVariantes((current) => ({
      ...current,
      [propiedad]: valor,
    }));
    setPaginaActual(1);
  };

  const handleSort = (nuevoOrden: string) => {
    setOrden(nuevoOrden);
    setPaginaActual(1);
  };

  return (
    <div className="space-y-4 px-2 md:px-4 p-2">
      <StockFiltersToolbar
        view={view}
        onViewChange={setView}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        categoriaActiva={categoriaActiva}
        onCategoriaChange={handleCategoriaChange}
        categoriasDisponibles={categoriasDisponibles}
        conteosPorCategoria={conteosPorCategoria}
        totalProductos={productosIndice.length}
        hayFiltrosActivos={hayFiltrosActivos}
        propiedadesGlobales={propiedadesGlobales}
        filtrosVariantes={filtrosVariantes}
        onFiltroVarianteChange={handleFiltroVarianteChange}
        isAdmin={isAdmin}
        onLimpiarFiltros={limpiarFiltros}
        slugCategoriaActiva={slugCategoriaActiva}
        nombreCategoriaActiva={categoriaActiva}
        nombreComercio={nombreComercio}
      />

      {/* 3. VISTAS — se mantiene StockTable/StockGrid montado durante el
          fetch de la página (nunca se desmonta por un loading state), así
          la selección de checkboxes sobrevive sin necesidad de moverla a
          otro componente. Solo se agrega una barra fina de progreso. */}
      <div className="bg-background rounded-xl border border-border overflow-hidden min-h-100 relative">
        {isLoadingPagina && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/60 animate-pulse z-10" />
        )}
        {view === "table" ? (
          <StockTable
            productos={productosPagina}
            userRole={userRole}
            nombreComercio={nombreComercio}
            mostrarSinStock={mostrarSinStock}
            orden={orden}
            onSort={handleSort}
          />
        ) : (
          <StockGrid
            productos={productosPagina}
            userRole={userRole}
            nombreComercio={nombreComercio}
            mostrarSinStock={mostrarSinStock}
          />
        )}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4 border-t border-border mt-4">
          <span className="text-xs font-medium text-muted-foreground">
            Mostrando{" "}
            {Math.min(
              productosOrdenados.length,
              (paginaActual - 1) * ITEMS_POR_PAGINA + 1,
            )}{" "}
            a{" "}
            {Math.min(
              productosOrdenados.length,
              paginaActual * ITEMS_POR_PAGINA,
            )}{" "}
            de {productosOrdenados.length} productos
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
