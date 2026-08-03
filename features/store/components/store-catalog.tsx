"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
import { resolverCategoriaPorSlug } from "@/shared/utils/category-tree";
import { parsearIdsSeleccion } from "@/shared/utils/compartir-catalogo";
import { ConfiguracionPOS } from "@/entities/config/types";

interface CategoriaProp {
  id: string;
  nombre: string;
  slug?: string | null;
  parent_id?: string | null;
}

interface StoreCatalogProps {
  productos: Producto[];
  config?: ConfiguracionPOS | null;
  categorias?: CategoriaProp[];
}

const ordenOptions: OrdenOption[] = [
  { value: DEFAULT_ORDEN, label: "Más vendidos" },
  { value: "recientes", label: "Últimos ingresos" },
  { value: "menor_precio", label: "Menor precio" },
  { value: "mayor_precio", label: "Mayor precio" },
];
const ORDEN_VALIDOS = new Set(ordenOptions.map((o) => o.value));

const PARAMS_RESERVADOS = new Set(["q", "categoria", "sub", "orden", "productos"]);

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
  // El parseo es el mismo que usa generateMetadata para armar el preview del
  // link: si divergen, la imagen compartida no coincide con lo que se abre.
  const idsSeleccionados = useMemo(() => {
    const ids = parsearIdsSeleccion(searchParams.get("productos"));
    return ids.length > 0 ? new Set(ids) : null;
  }, [searchParams]);
  const modoSeleccion = idsSeleccionados !== null;
  const productosBase = modoSeleccion
    ? productos.filter((p) => idsSeleccionados.has(p.id))
    : productos;

  const categoriasBase = useMemo(
    () =>
      (categorias || []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        slug: c.slug || "",
        parent_id: c.parent_id ?? null,
      })),
    [categorias],
  );

  // --- categoria (?categoria=<slug>) + sub (?sub=<slug>) ---
  // La identidad (padre/hijo) se resuelve contra la lista PLANA de
  // categorías, sin importar stock — así un link viejo a lo que hoy es
  // una subcategoría (ej. ?categoria=boxer, compartido antes de que Boxer
  // se re-parentara bajo Ropa Hombre) sigue resolviendo a los mismos
  // productos aunque la URL canónica hoy sea otra.
  const categoriaParam = searchParams.get("categoria");
  const subParam = searchParams.get("sub");

  const resolucion = useMemo(() => {
    if (!categoriaParam) return null;
    return resolverCategoriaPorSlug(categoriasBase, categoriaParam);
  }, [categoriaParam, categoriasBase]);

  // Si vino &sub= explícito, tiene que matchear una subcategoría REAL del
  // mismo padre resuelto arriba — si no matchea nada, se ignora (se
  // degrada a "Todo <Padre>" en vez de romper el filtro).
  const subResuelto = useMemo(() => {
    if (!subParam || !resolucion) return null;
    const key = subParam.toLowerCase();
    const match = categoriasBase.find(
      (c) =>
        c.parent_id === resolucion.padreId &&
        (c.id.toLowerCase() === key || c.slug.toLowerCase() === key),
    );
    return match?.id ?? null;
  }, [subParam, resolucion, categoriasBase]);

  const tipo = useMemo(() => {
    if (!resolucion) return DEFAULT_TIPO;
    if (subResuelto) return subResuelto;
    if (resolucion.hijoId) return resolucion.hijoId;
    return resolucion.padreId;
  }, [resolucion, subResuelto]);

  // --- orden (?orden=<valor>) ---
  const ordenParam = searchParams.get("orden");
  const orden =
    ordenParam && ORDEN_VALIDOS.has(ordenParam) ? ordenParam : DEFAULT_ORDEN;

  // 🚀 NUEVO: Filtramos los productos por la categoría activa y la búsqueda
  // ANTES de extraer las variantes, para que los filtros sean contextuales.
  const productosContextuales = useMemo(() => {
    if (modoSeleccion) return productosBase;

    return productosBase.filter((p) => {
      // 1. Filtro por Búsqueda de texto
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchBuscador =
          p.nombre?.toLowerCase().includes(q) ||
          p.tipo?.toLowerCase().includes(q) ||
          p.descripcion?.toLowerCase().includes(q);
        if (!matchBuscador) return false;
      }

      // 2. Filtro por Categoría activa
      if (tipo !== DEFAULT_TIPO) {
        // NOTA: Ajusta `p.categoria_id` si en tu interfaz Producto la propiedad se llama distinto
        // (por ejemplo: p.tipo_id, p.categoria, etc.)
        const catId = (p as any).categoria_id; 
        if (!catId) return false;

        // Match exacto (Ej: Seleccionó Hombre y el producto es Hombre)
        if (catId === tipo) return true;

        // Match por subcategoría (Ej: Seleccionó Hombre y el producto es Remeras Hombre)
        const catDelProducto = categoriasBase.find(c => c.id === catId);
        if (catDelProducto?.parent_id === tipo) return true;

        return false;
      }

      return true;
    });
  }, [productosBase, modoSeleccion, searchQuery, tipo, categoriasBase]);

  const propiedadesGlobales = useMemo(
    () =>
      buildPropiedadesFiltro(productosContextuales, {
        ocultarSinStock: config?.mostrar_sin_stock === false,
        incluirStockLegacy: false,
      }),
    [productosContextuales, config],
  );

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
    arbolCategorias,
    productosFiltrados,
    productosVisibles,
    hayMasProductos,
    hayFiltrosActivos,
    matchesFueraDeCategoria,
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

  const updateParams = (
    entries: Record<string, string | null>,
    mode: "push" | "replace",
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(entries)) {
      if (value) params.set(name, value);
      else params.delete(name);
    }

    const url = params.toString() ? `${pathname}?${params}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };

  // Canonicaliza links viejos: si `categoria` resolvió directo a lo que
  // hoy es una subcategoría (sin &sub= explícito todavía), reescribe la
  // URL a la forma padre+sub sin agregar entrada al historial — mismos
  // productos filtrados de siempre, el link viejo sigue funcionando.
  useEffect(() => {
    if (!resolucion?.hijoId || subResuelto) return;
    const padre = categoriasBase.find((c) => c.id === resolucion.padreId);
    const hijo = categoriasBase.find((c) => c.id === resolucion.hijoId);
    if (!padre?.slug || !hijo?.slug) return;
    updateParams({ categoria: padre.slug, sub: hijo.slug }, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolucion, subResuelto, categoriasBase]);

  const handleSelectTodos = () => {
    resetVisibleCount();
    updateParams({ categoria: null, sub: null }, "push");
  };

  // Un solo id de entrada: puede ser un padre (entra a nivel 2 / "Todo
  // <Padre>"), un hijo (nivel 2 con ese hijo activo), o una categoría
  // suelta (comportamiento plano de siempre).
  const handleSelectCategoria = (id: string) => {
    resetVisibleCount();

    const padre = arbolCategorias.padres.find((p) => p.id === id);
    if (padre) {
      updateParams({ categoria: padre.slug, sub: null }, "push");
      return;
    }

    const padreDeHijo = arbolCategorias.padres.find((p) =>
      p.hijos.some((h) => h.id === id),
    );
    if (padreDeHijo) {
      const hijo = padreDeHijo.hijos.find((h) => h.id === id)!;
      updateParams({ categoria: padreDeHijo.slug, sub: hijo.slug }, "push");
      return;
    }

    const cat = categoriasBase.find((c) => c.id === id);
    updateParams({ categoria: cat?.slug ?? id, sub: null }, "push");
  };

  const handleOrdenChange = (value: string) => {
    resetVisibleCount();
    updateParams({ orden: value === DEFAULT_ORDEN ? null : value }, "replace");
  };

  const handleFiltroVarianteChange = (propiedad: string, valor: string) => {
    resetVisibleCount();
    const paramName = slugify(propiedad);
    if (PARAMS_RESERVADOS.has(paramName)) return;
    updateParams({ [paramName]: valor === "todos" ? null : valor }, "push");
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
            tipoActivo={tipo}
            arbolCategorias={arbolCategorias}
            onSelectTodos={handleSelectTodos}
            onSelectCategoria={handleSelectCategoria}
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

          {tipo !== DEFAULT_TIPO && matchesFueraDeCategoria > 0 && (
            <button
              type="button"
              onClick={handleSelectTodos}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Ver {matchesFueraDeCategoria} resultado
              {matchesFueraDeCategoria === 1 ? "" : "s"} más en todo el
              catálogo
            </button>
          )}
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
            {productosVisibles.map((producto, index) => (
              <ProductCard
                key={producto.id}
                producto={producto}
                priority={index < 8}
              />
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
                className="w-full sm:w-auto font-bold rounded-none border-border shadow-none text-foreground px-12 uppercase tracking-widest text-xs transition-colors h-14 cursor-pointer"
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
