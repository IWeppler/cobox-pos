"use client";

import { Suspense, useState } from "react";
import { Producto } from "@/entities/productos/types";
import { Button } from "@/shared/ui/button";
import { Plus, SearchX, ShoppingBag } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CategoryPills } from "./CategoryPills";
import { CatalogToolbar, OrdenOption } from "./CatalogToolbar";
import { ProductCard } from "./product-card";
import {
  DEFAULT_ORDEN,
  DEFAULT_TIPO,
  ITEMS_POR_PAGINA,
  useCatalogFilters,
} from "../hooks/use-catalog-filters";
import { ConfiguracionPOS } from "@/entities/config/types";

interface StoreCatalogProps {
  productos: Producto[];
  config?: ConfiguracionPOS | null;
  categorias?: {
    id: string;
    nombre: string;
    slug?: string | null;
  }[];
}

const ordenOptions: OrdenOption[] = [
  { value: DEFAULT_ORDEN, label: "Más vendidos" },
  { value: "recientes", label: "Últimos ingresos" },
  { value: "menor_precio", label: "Menor precio" },
  { value: "mayor_precio", label: "Mayor precio" },
];

export function StoreCatalog({
  productos,
  config,
  categorias,
}: Readonly<StoreCatalogProps>) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }
    >
      <CatalogContent
        productos={productos}
        config={config}
        categorias={categorias}
      />
    </Suspense>
  );
}

function CatalogContent({
  productos,
  config,
  categorias,
}: Readonly<StoreCatalogProps>) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchQuery = searchParams.get("q") || "";

  const [tipo, setTipo] = useState(DEFAULT_TIPO);
  const [orden, setOrden] = useState(DEFAULT_ORDEN);
  const [visibleCount, setVisibleCount] = useState(ITEMS_POR_PAGINA);

  const [filtrosVariantes, setFiltrosVariantes] = useState<
    Record<string, string>
  >({});

  const {
    propiedadesGlobales,
    categoriasConStock,
    productosFiltrados,
    productosVisibles,
    hayMasProductos,
    hayFiltrosActivos,
  } = useCatalogFilters({
    productos,
    categorias,
    config,
    searchQuery,
    tipo,
    filtrosVariantes,
    orden,
    visibleCount,
  });

  const resetVisibleCount = () => setVisibleCount(ITEMS_POR_PAGINA);

  const handleTipoChange = (value: string) => {
    setTipo(value);
    resetVisibleCount();
  };

  const handleOrdenChange = (value: string) => {
    setOrden(value);
    resetVisibleCount();
  };

  const handleFiltroVarianteChange = (propiedad: string, valor: string) => {
    setFiltrosVariantes((prev) => ({ ...prev, [propiedad]: valor }));
    resetVisibleCount();
  };

  const limpiarFiltros = () => {
    setTipo(DEFAULT_TIPO);
    setFiltrosVariantes({});
    setOrden(DEFAULT_ORDEN);
    resetVisibleCount();

    if (searchQuery) {
      router.replace(pathname);
    }
  };

  if (productos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <ShoppingBag
          className="w-16 h-16 text-muted-foreground/20 mb-6"
          strokeWidth={1}
        />
        <h2 className="text-2xl font-light text-foreground tracking-tight">
          Catálogo vacío
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CategoryPills
        tipo={tipo}
        categoriasConStock={categoriasConStock}
        onTipoChange={handleTipoChange}
      />

      <CatalogToolbar
        propiedadesGlobales={propiedadesGlobales}
        filtrosVariantes={filtrosVariantes}
        orden={orden}
        searchQuery={searchQuery}
        hayFiltrosActivos={hayFiltrosActivos}
        ordenOptions={ordenOptions}
        onFiltroVarianteChange={handleFiltroVarianteChange}
        onOrdenChange={handleOrdenChange}
        onLimpiarFiltros={limpiarFiltros}
      />

      {productosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchX
            className="w-12 h-12 text-muted-foreground/30 mb-4"
            strokeWidth={1}
          />
          <h2 className="text-xl font-medium text-foreground tracking-tight">
            No encontramos resultados
          </h2>
          <Button
            variant="link"
            className="mt-4 text-foreground underline underline-offset-4"
            onClick={limpiarFiltros}
          >
            Limpiar filtros
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12">
            {productosVisibles.map((producto) => (
              <ProductCard key={producto.id} producto={producto} />
            ))}
          </div>

          {hayMasProductos && (
            <div className="flex justify-center pt-12 pb-8">
              <Button
                variant="outline"
                size="lg"
                onClick={() =>
                  setVisibleCount((prev) => prev + ITEMS_POR_PAGINA)
                }
                className="w-full sm:w-auto font-bold rounded-none border-border shadow-none text-foreground hover:bg-neutral-900 hover:text-white px-12 uppercase tracking-widest text-xs transition-colors h-14 cursor-pointer"
              >
                <Plus className="mr-2 h-4 w-4" /> Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
