import { useCallback, useMemo } from "react";
import { Producto } from "@/entities/productos/types";
import { parseRawVariantString } from "@/entities/productos/lib/parse-variant-attributes";
import {
  buildPropiedadesFiltro,
  resolverAtributosVariante,
} from "@/entities/productos/lib/build-propiedades-filtro";

export const DEFAULT_TIPO = "todos";
export const DEFAULT_ORDEN = "mas_vendidos";
export const ITEMS_POR_PAGINA = 12;

export interface CategoriaConStock {
  id: string;
  nombre: string;
  count: number;
}

interface CategoriaCatalogo {
  id: string;
  nombre: string;
  slug?: string | null;
}

interface CatalogConfig {
  mostrar_sin_stock?: boolean;
}

interface UseCatalogFiltersProps {
  productos: Producto[];
  categorias?: CategoriaCatalogo[];
  config?: CatalogConfig | null;
  searchQuery: string;
  tipo: string;
  filtrosVariantes: Record<string, string | string[]>;
  orden: string;
  visibleCount: number;
}

export function useCatalogFilters({
  productos,
  categorias = [],
  config,
  searchQuery,
  tipo,
  filtrosVariantes,
  orden,
  visibleCount,
}: UseCatalogFiltersProps) {
  const propiedadesGlobales = useMemo(
    () =>
      buildPropiedadesFiltro(productos, {
        ocultarSinStock: config?.mostrar_sin_stock === false,
        // Confirmado: ningún producto publicado depende del fallback legacy
        // (productos_stock.variante) para aparecer en Filtros Extra — el
        // único caso sin producto_variantes tampoco tiene stock legacy. Se
        // desactiva acá para que "Propiedad N" no pueda volver a filtrarse
        // en el catálogo público sin importar cómo fluctúe el stock.
        incluirStockLegacy: false,
      }),
    [productos, config],
  );

  // Búsqueda + filtros de variante, sin el filtro de categoría — se comparte
  // entre el filtrado de productos y el conteo facetado de cada chip (que
  // nunca debe filtrarse por su propia categoría).
  const matchSearchYVariante = useCallback(
    (c: Producto) => {
      const nombreStr = c.nombre || "";
      const matchSearch = nombreStr
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      const matchVariante = Object.entries(filtrosVariantes).every(
        ([propKey, propVal]) => {
          const valores = Array.isArray(propVal)
            ? propVal
            : propVal === "todos"
              ? []
              : [propVal];
          if (valores.length === 0) return true;
          const valoresNormalizados = valores.map((v) => v.toLowerCase());

          const matchNew =
            c.producto_variantes?.some((pv) => {
              if ((pv.stock_disponible ?? pv.stock) <= 0) return false;
              const atributos = resolverAtributosVariante(pv);
              const val = atributos[propKey]?.toLowerCase();
              return val !== undefined && valoresNormalizados.includes(val);
            }) ?? false;

          const matchOld =
            c.stock?.some((s) => {
              if (s.cantidad <= 0) return false;
              const parsed = parseRawVariantString(s.variante || "");
              const val = parsed[propKey]?.toLowerCase();
              return val !== undefined && valoresNormalizados.includes(val);
            }) ?? false;

          return matchOld || matchNew;
        },
      );

      return matchSearch && matchVariante;
    },
    [searchQuery, filtrosVariantes],
  );

  // conteosTotales: solo el filtro de stock — decide qué categorías existen
  // (un chip sin ningún producto no debería existir nunca).
  // conteosFacetados: además de eso, búsqueda + variantes activos — es el
  // número que se muestra en cada chip. Facetado estándar: nunca se filtra
  // por la categoría del propio chip, si no cada uno terminaría mostrando
  // su propio total sin importar el resto de los filtros.
  const { conteosTotales, conteosFacetados } = useMemo(() => {
    const totales: Record<string, number> = {};
    const facetados: Record<string, number> = {};
    productos.forEach((p) => {
      const stockViejos = p.stock?.reduce((acc, s) => acc + s.cantidad, 0) || 0;
      const stockNuevos =
        p.producto_variantes?.reduce(
          (acc, v) => acc + (v.stock_disponible ?? v.stock),
          0,
        ) || 0;
      const stockTotal = stockViejos + stockNuevos;

      if (config?.mostrar_sin_stock === false && stockTotal <= 0) return;

      const catKey = (
        p.categoria_id ||
        p.tipo ||
        "sin-categoria"
      ).toLowerCase();
      totales[catKey] = (totales[catKey] || 0) + 1;

      if (matchSearchYVariante(p)) {
        facetados[catKey] = (facetados[catKey] || 0) + 1;
      }
    });
    return { conteosTotales: totales, conteosFacetados: facetados };
  }, [productos, config, matchSearchYVariante]);

  const categoriasConStock = useMemo<CategoriaConStock[]>(() => {
    if (!categorias || categorias.length === 0) {
      return Object.entries(conteosTotales)
        .map(([k]) => {
          const prodMatch = productos.find(
            (p) =>
              p.categoria_id?.toLowerCase() === k ||
              (p.tipo || "").toLowerCase() === k,
          );

          let fallbackName = "Categoría";
          if (prodMatch && prodMatch.tipo) {
            fallbackName = prodMatch.tipo;
          } else {
            fallbackName = k.charAt(0).toUpperCase() + k.slice(1);
          }

          return { id: k, nombre: fallbackName, count: conteosFacetados[k] || 0 };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    return categorias
      .map((cat) => {
        const idKey = cat.id.toLowerCase();
        const slugKey = (cat.slug || "").toLowerCase();
        const nombreKey = (cat.nombre || "").toLowerCase();
        const total =
          (conteosTotales[idKey] || 0) +
          (conteosTotales[slugKey] || 0) +
          (conteosTotales[nombreKey] || 0);
        const count =
          (conteosFacetados[idKey] || 0) +
          (conteosFacetados[slugKey] || 0) +
          (conteosFacetados[nombreKey] || 0);
        return { id: cat.id, nombre: cat.nombre, count, total };
      })
      .filter((cat) => cat.total > 0)
      .map((cat) => ({ id: cat.id, nombre: cat.nombre, count: cat.count }));
  }, [categorias, conteosTotales, conteosFacetados, productos]);

  const productosFiltrados = useMemo(() => {
    const resultado = productos.filter((c) => {
      const stockViejos = c.stock?.reduce((acc, s) => acc + s.cantidad, 0) || 0;
      const stockNuevos =
        c.producto_variantes?.reduce(
          (acc, v) => acc + (v.stock_disponible ?? v.stock),
          0,
        ) || 0;
      const stockTotal = stockViejos + stockNuevos;

      if (config?.mostrar_sin_stock === false && stockTotal <= 0) return false;

      const tipoStr = c.tipo || "";
      const catIdStr = c.categoria_id || "";

      const catObj = categorias?.find((cat) => cat.id === tipo);
      const matchTipo =
        tipo === "todos" ||
        catIdStr === tipo ||
        tipoStr.toLowerCase() === tipo.toLowerCase() ||
        (catObj && catObj.slug?.toLowerCase() === tipoStr.toLowerCase()) ||
        (catObj && catObj.nombre?.toLowerCase() === tipoStr.toLowerCase());

      return matchTipo && matchSearchYVariante(c);
    });

    resultado.sort((a, b) => {
      if (orden === "mas_vendidos") {
        const ventasA = (a as Producto & { ventas_count?: number })
          .ventas_count;
        const ventasB = (b as Producto & { ventas_count?: number })
          .ventas_count;
        if ((ventasA || 0) !== (ventasB || 0)) {
          return (ventasB || 0) - (ventasA || 0);
        }
        return (
          new Date(b.creado_en || 0).getTime() -
          new Date(a.creado_en || 0).getTime()
        );
      }
      if (orden === "recientes") {
        return (
          new Date(b.creado_en || 0).getTime() -
          new Date(a.creado_en || 0).getTime()
        );
      }
      if (orden === "menor_precio") return (a.precio || 0) - (b.precio || 0);
      if (orden === "mayor_precio") return (b.precio || 0) - (a.precio || 0);
      return 0;
    });

    return resultado;
  }, [productos, matchSearchYVariante, tipo, orden, config, categorias]);

  const productosVisibles = productosFiltrados.slice(0, visibleCount);
  const hayMasProductos = visibleCount < productosFiltrados.length;

  const hayFiltrosActivos =
    tipo !== "todos" ||
    orden !== "mas_vendidos" ||
    searchQuery !== "" ||
    Object.values(filtrosVariantes).some((v) =>
      Array.isArray(v) ? v.length > 0 : v !== "todos",
    );

  return {
    propiedadesGlobales,
    categoriasConStock,
    productosFiltrados,
    productosVisibles,
    hayMasProductos,
    hayFiltrosActivos,
  };
}
