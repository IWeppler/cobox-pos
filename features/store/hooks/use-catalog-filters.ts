import { useCallback, useMemo } from "react";
import { Producto } from "@/entities/productos/types";
import { parseRawVariantString } from "@/entities/productos/lib/parse-variant-attributes";
import {
  buildPropiedadesFiltro,
  resolverAtributosVariante,
} from "@/entities/productos/lib/build-propiedades-filtro";
import {
  esPropiedadColor,
  valorPerteneceAFamilia,
} from "@/entities/productos/lib/color-familias";
import {
  construirArbolCategorias,
  aplanarArbolCategorias,
  type ArbolCategorias,
  type PadreConHijos,
  type CategoriaConCount,
} from "@/shared/utils/category-tree";

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
  parent_id?: string | null;
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

export interface CategoriaResuelta {
  padre: PadreConHijos | null;
  hijo: CategoriaConCount | null;
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
        agruparColores: true,
      }),
    [productos, config],
  );

  // Búsqueda + filtros de variante, sin el filtro de categoría — se comparte
  // entre el filtrado de productos y el conteo facetado de cada chip (que
  // nunca debe filtrarse por su propia categoría).
  const matchSearchYVariante = useCallback(
    (c: Producto) => {
      const query = searchQuery.toLowerCase().trim();

      // 1. Buscar en propiedades del producto padre
      const matchNombre = (c.nombre || "").toLowerCase().includes(query);
      const matchMarca = (c.marca || "").toLowerCase().includes(query);
      const matchModelo = (c.modelo || "").toLowerCase().includes(query);

      // 2. Buscar en el SKU de las variantes (producto_variantes)
      const matchSku =
        c.producto_variantes?.some((pv) =>
          pv.sku?.toLowerCase().includes(query),
        ) ?? false;

      // 3. Matchea si alguna de las condiciones se cumple
      const matchSearch = matchNombre || matchMarca || matchModelo || matchSku;

      const matchVariante = Object.entries(filtrosVariantes).every(
        ([propKey, propVal]) => {
          const valores = Array.isArray(propVal)
            ? propVal
            : propVal === "todos"
              ? []
              : [propVal];
          if (valores.length === 0) return true;
          const valoresNormalizados = valores.map((v) => v.toLowerCase());

          // El filtro de color guarda la FAMILIA ("Azul"), no el valor crudo
          // ("asul", "azul/azul", "azul con bigote"), así que la comparación
          // tiene que pasar por el mismo mapeo que armó las opciones. Para el
          // resto de las propiedades sigue siendo igualdad exacta.
          const esColor = esPropiedadColor(propKey);
          const coincide = (valorCrudo: string | undefined) => {
            if (valorCrudo === undefined) return false;
            if (!esColor) {
              return valoresNormalizados.includes(valorCrudo.toLowerCase());
            }
            return valores.some((familia) =>
              valorPerteneceAFamilia(valorCrudo, familia),
            );
          };

          const matchNew =
            c.producto_variantes?.some((pv) => {
              if ((pv.stock_disponible ?? pv.stock) <= 0) return false;
              const atributos = resolverAtributosVariante(pv);
              return coincide(atributos[propKey]);
            }) ?? false;

          const matchOld =
            c.stock?.some((s) => {
              if (s.cantidad <= 0) return false;
              const parsed = parseRawVariantString(s.variante || "");
              return coincide(parsed[propKey]);
            }) ?? false;

          return matchOld || matchNew;
        },
      );

      return matchSearch && matchVariante;
    },
    [searchQuery, filtrosVariantes],
  );

  // Filtro de stock (visibilidad), compartido entre conteos y filtrado —
  // antes vivía copiado 2 veces, ahora 3 (se suma matchesFueraDeCategoria).
  const pasaFiltroStock = useCallback(
    (p: Producto) => {
      const stockViejos = p.stock?.reduce((acc, s) => acc + s.cantidad, 0) || 0;
      const stockNuevos =
        p.producto_variantes?.reduce(
          (acc, v) => acc + (v.stock_disponible ?? v.stock),
          0,
        ) || 0;
      const stockTotal = stockViejos + stockNuevos;
      return !(config?.mostrar_sin_stock === false && stockTotal <= 0);
    },
    [config],
  );

  // Lookup id/slug/nombre (lowercased) -> id real de categoría. Permite
  // creditar tanto productos con categoria_id real (ya arreglado en
  // getProductosAction) como los legacy que solo traen `tipo` (texto
  // libre) matcheando el nombre/slug de una categoría real.
  const categoriaIdPorClave = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categorias) {
      map.set(cat.id.toLowerCase(), cat.id);
      if (cat.slug) map.set(cat.slug.toLowerCase(), cat.id);
      if (cat.nombre) map.set(cat.nombre.toLowerCase(), cat.id);
    }
    return map;
  }, [categorias]);

  const resolverCategoriaIdDeProducto = useCallback(
    (p: Producto): string => {
      const porId = p.categoria_id
        ? categoriaIdPorClave.get(p.categoria_id.toLowerCase())
        : undefined;
      if (porId) return porId;
      const porTipo = p.tipo
        ? categoriaIdPorClave.get(p.tipo.toLowerCase())
        : undefined;
      if (porTipo) return porTipo;
      return (p.categoria_id || p.tipo || "sin-categoria").toLowerCase();
    },
    [categoriaIdPorClave],
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
      if (!pasaFiltroStock(p)) return;

      const catKey = resolverCategoriaIdDeProducto(p);
      totales[catKey] = (totales[catKey] || 0) + 1;

      if (matchSearchYVariante(p)) {
        facetados[catKey] = (facetados[catKey] || 0) + 1;
      }
    });
    return { conteosTotales: totales, conteosFacetados: facetados };
  }, [
    productos,
    pasaFiltroStock,
    resolverCategoriaIdDeProducto,
    matchSearchYVariante,
  ]);

  const arbolCategorias: ArbolCategorias = useMemo(
    () =>
      construirArbolCategorias(
        categorias.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          slug: c.slug || "",
          parent_id: c.parent_id ?? null,
        })),
        conteosTotales,
        conteosFacetados,
      ),
    [categorias, conteosTotales, conteosFacetados],
  );

  // ids de padre -> ids de sus hijos, para expandir el filtro cuando la
  // categoría activa es un padre ("Todo Ropa Mujer" = Ropa Mujer + todas
  // sus subs).
  const hijosIdsPorPadreId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const padre of arbolCategorias.padres) {
      map.set(padre.id, new Set(padre.hijos.map((h) => h.id)));
    }
    return map;
  }, [arbolCategorias]);

  const idsAMatchear = useMemo(() => {
    if (tipo === DEFAULT_TIPO) return null; // null = sin filtro de categoría
    const hijosDelPadre = hijosIdsPorPadreId.get(tipo);
    if (hijosDelPadre) return new Set([tipo, ...hijosDelPadre]);
    return new Set([tipo]);
  }, [tipo, hijosIdsPorPadreId]);

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

          return {
            id: k,
            nombre: fallbackName,
            count: conteosFacetados[k] || 0,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    return aplanarArbolCategorias(arbolCategorias).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      count: c.count,
    }));
  }, [
    categorias,
    conteosTotales,
    conteosFacetados,
    productos,
    arbolCategorias,
  ]);

  /**
   * Resuelve un slug o id de URL a `{ padre, hijo }` contra el árbol de 2
   * niveles — es el corazón de la compatibilidad con links viejos: un
   * link compartido antes de que una categoría se re-parentara (ej.
   * `?categoria=boxer` de cuando Boxer todavía era raíz) sigue resolviendo
   * a los mismos productos, ahora identificado como hijo de Ropa Hombre.
   * Si el slug no matchea nada en el árbol de 2 niveles (categoría plana,
   * o inexistente), devuelve `{ padre: null, hijo: null }` — el caller
   * cae al comportamiento de categoría plana ya existente.
   */
  const resolverCategoria = useCallback(
    (slugOrId: string): CategoriaResuelta => {
      if (!slugOrId || slugOrId === DEFAULT_TIPO) {
        return { padre: null, hijo: null };
      }

      const key = slugOrId.toLowerCase();
      const matchesKey = (c: { id: string; slug: string }) =>
        c.id.toLowerCase() === key || c.slug.toLowerCase() === key;

      const padreDirecto = arbolCategorias.padres.find((p) => matchesKey(p));
      if (padreDirecto) return { padre: padreDirecto, hijo: null };

      for (const padre of arbolCategorias.padres) {
        const hijo = padre.hijos.find((h) => matchesKey(h));
        if (hijo) return { padre, hijo };
      }

      return { padre: null, hijo: null };
    },
    [arbolCategorias],
  );

  const productosFiltrados = useMemo(() => {
    const resultado = productos.filter((c) => {
      if (!pasaFiltroStock(c)) return false;

      const matchTipo =
        idsAMatchear === null ||
        idsAMatchear.has(resolverCategoriaIdDeProducto(c));

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
  }, [
    productos,
    pasaFiltroStock,
    idsAMatchear,
    resolverCategoriaIdDeProducto,
    matchSearchYVariante,
    orden,
  ]);

  // Búsqueda transversal: cuántos productos matchean búsqueda+variante
  // (con el mismo filtro de stock) por FUERA de la categoría/subcategoría
  // activa — para el escape "ver N resultados en todo el catálogo".
  const matchesFueraDeCategoria = useMemo(() => {
    if (tipo === DEFAULT_TIPO) return 0;
    const totalSinCategoria = productos.filter(
      (p) => pasaFiltroStock(p) && matchSearchYVariante(p),
    ).length;
    return Math.max(0, totalSinCategoria - productosFiltrados.length);
  }, [
    tipo,
    productos,
    pasaFiltroStock,
    matchSearchYVariante,
    productosFiltrados,
  ]);

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
    arbolCategorias,
    resolverCategoria,
    // La portada necesita saber a qué categoría pertenece cada producto para
    // elegirle imagen. Se expone la MISMA función que usa el filtrado — que
    // ya resuelve tanto `categoria_id` real como el `tipo` legacy de texto
    // libre — en vez de reimplementarla y quedar con dos verdades.
    resolverCategoriaIdDeProducto,
    productosFiltrados,
    productosVisibles,
    hayMasProductos,
    hayFiltrosActivos,
    matchesFueraDeCategoria,
  };
}
