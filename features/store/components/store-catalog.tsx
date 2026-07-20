"use client";

import { Suspense, useMemo, useState } from "react";
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
import { buildPropiedadesFiltro } from "@/entities/productos/lib/build-propiedades-filtro";
import { slugify } from "@/shared/utils/slugify";
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
const ORDEN_VALIDOS = new Set(ordenOptions.map((o) => o.value));

// Nombres de query param que un filtro de propiedad dinámica (Talle, Color,
// Género, etc.) NUNCA puede pisar — si una tienda tuviera un atributo cuyo
// slug coincidiera con uno de estos, ese atributo simplemente no se
// sincroniza a la URL (degrada con gracia, no rompe nada).
const PARAMS_RESERVADOS = new Set(["q", "categoria", "orden", "productos"]);

// Cap defensivo para ?productos=id1,id2,... — un link con de más no debe
// poder forzar una consulta arbitrariamente grande.
const MAX_PRODUCTOS_SELECCIONADOS = 30;

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

  // --- ?productos=id1,id2,... — selección curada, gana sobre el resto ---
  const idsSeleccionados = useMemo(() => {
    const raw = searchParams.get("productos");
    if (!raw) return null;
    const ids = [
      ...new Set(
        raw
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ].slice(0, MAX_PRODUCTOS_SELECCIONADOS);
    return ids.length > 0 ? new Set(ids) : null;
  }, [searchParams]);
  const modoSeleccion = idsSeleccionados !== null;
  const productosBase = modoSeleccion
    ? productos.filter((p) => idsSeleccionados.has(p.id))
    : productos;

  // --- categoria (?categoria=<slug>) — el estado interno sigue siendo el
  // id de la categoría (así lo espera useCatalogFilters); solo la URL
  // habla en slugs, más lindo para compartir. ---
  const categoriaParam = searchParams.get("categoria");
  const tipo = useMemo(() => {
    if (!categoriaParam) return DEFAULT_TIPO;
    const match = categorias?.find(
      (cat) => cat.slug?.toLowerCase() === categoriaParam.toLowerCase(),
    );
    return match?.id ?? DEFAULT_TIPO;
  }, [categoriaParam, categorias]);

  // --- orden (?orden=<valor>) ---
  const ordenParam = searchParams.get("orden");
  const orden =
    ordenParam && ORDEN_VALIDOS.has(ordenParam) ? ordenParam : DEFAULT_ORDEN;

  // Mismo cálculo que hace useCatalogFilters puertas adentro — se repite acá
  // (memoizado, barato) porque hace falta ANTES de armar filtrosVariantes
  // desde la URL, y ese hook no expone un paso intermedio.
  const propiedadesGlobales = useMemo(
    () =>
      buildPropiedadesFiltro(productosBase, {
        ocultarSinStock: config?.mostrar_sin_stock === false,
        incluirStockLegacy: false,
      }),
    [productosBase, config],
  );

  // --- propiedades de variante (?talle=M&color=Rojo&... — un param por
  // propiedad activa, nombre = slugify de la propiedad) ---
  const filtrosVariantes = useMemo(() => {
    if (modoSeleccion) return {};
    const result: Record<string, string> = {};
    for (const propName of Object.keys(propiedadesGlobales)) {
      const paramName = slugify(propName);
      if (PARAMS_RESERVADOS.has(paramName)) continue;
      const valor = searchParams.get(paramName);
      if (valor) result[propName] = valor;
    }
    return result;
  }, [searchParams, propiedadesGlobales, modoSeleccion]);

  const [visibleCount, setVisibleCount] = useState(ITEMS_POR_PAGINA);

  const {
    categoriasConStock,
    productosFiltrados,
    productosVisibles,
    hayMasProductos,
    hayFiltrosActivos,
  } = useCatalogFilters({
    productos: productosBase,
    categorias,
    config,
    searchQuery: modoSeleccion ? "" : searchQuery,
    tipo: modoSeleccion ? DEFAULT_TIPO : tipo,
    filtrosVariantes,
    orden,
    visibleCount,
  });

  const resetVisibleCount = () => setVisibleCount(ITEMS_POR_PAGINA);

  const updateParam = (
    name: string,
    value: string | null,
    mode: "push" | "replace",
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);

    const url = params.toString() ? `${pathname}?${params}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };

  const handleTipoChange = (value: string) => {
    resetVisibleCount();
    if (value === DEFAULT_TIPO) {
      updateParam("categoria", null, "push");
      return;
    }
    const cat = categorias?.find((c) => c.id === value);
    updateParam("categoria", cat?.slug ?? value, "push");
  };

  const handleOrdenChange = (value: string) => {
    resetVisibleCount();
    updateParam("orden", value === DEFAULT_ORDEN ? null : value, "replace");
  };

  const handleFiltroVarianteChange = (propiedad: string, valor: string) => {
    resetVisibleCount();
    const paramName = slugify(propiedad);
    if (PARAMS_RESERVADOS.has(paramName)) return;
    updateParam(paramName, valor === "todos" ? null : valor, "push");
  };

  const limpiarFiltros = () => {
    resetVisibleCount();
    router.replace(pathname);
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
      {!modoSeleccion && (
        <>
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
        </>
      )}

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
