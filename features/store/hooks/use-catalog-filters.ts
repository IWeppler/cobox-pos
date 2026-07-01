import { useMemo } from "react";
import { Producto } from "@/entities/productos/types";

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
  filtrosVariantes: Record<string, string>;
  orden: string;
  visibleCount: number;
}

function parseLegacyVariant(raw: string): Record<string, string> {
  const v = raw?.trim() || "";
  if (!v || v.toLowerCase() === "unico" || v.toLowerCase() === "único")
    return {};

  const result: Record<string, string> = {};

  if (v.includes("/") || v.includes("-")) {
    const separator = v.includes("/") ? "/" : "-";
    const parts = v.split(separator).map((p) => p.trim());

    if (parts.length >= 2) {
      result["Color"] = parts[0];
      result["Talle"] = parts[1];

      // Si por casualidad separan 3 cosas (Ej: Rojo/L/Algodón)
      for (let i = 2; i < parts.length; i++) {
        result[`Opción ${i + 1}`] = parts[i];
      }
      return result;
    }
  }

  // Si no tiene separadores (ej: "10L", "Atado", "Bandeja"), cae como Opción genérica
  result["Opción"] = v;
  return result;
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
  // 1. EXTRACTOR GLOBAL DE PROPIEDADES (Puro JSONB Nativo)
  const propiedadesGlobales = useMemo(() => {
    const propsMap: Record<string, Set<string>> = {};

    productos.forEach((p) => {
      // Esquema nuevo (JSONB)
      p.producto_variantes?.forEach((v) => {
        if (config?.mostrar_sin_stock === false && v.stock <= 0) return;

        // Si la variante tiene un JSON de atributos reales
        if (v.atributos && Object.keys(v.atributos).length > 0) {
          Object.entries(v.atributos).forEach(([key, val]) => {
            if (!propsMap[key]) propsMap[key] = new Set();
            propsMap[key].add((val as string).trim());
          });
        }
        // Si no tiene JSON, aplicamos el Auto-Split al nombre
        else if (v.nombre_display) {
          const parsed = parseLegacyVariant(v.nombre_display);
          Object.entries(parsed).forEach(([key, val]) => {
            if (!propsMap[key]) propsMap[key] = new Set();
            propsMap[key].add(val);
          });
        }
      });

      // Esquema viejo (Stock Legacy) con Auto-Split
      p.stock?.forEach((s) => {
        if (config?.mostrar_sin_stock === false && s.cantidad <= 0) return;
        const parsed = parseLegacyVariant(s.variante);
        Object.entries(parsed).forEach(([key, val]) => {
          if (!propsMap[key]) propsMap[key] = new Set();
          propsMap[key].add(val);
        });
      });
    });

    const result: Record<string, string[]> = {};
    Object.keys(propsMap)
      .sort()
      .forEach((k) => {
        result[k] = Array.from(propsMap[k]).sort();
      });
    return result;
  }, [productos, config]);

  const conteosRaw = useMemo(() => {
    const conteos: Record<string, number> = {};
    productos.forEach((p) => {
      const stockViejos = p.stock?.reduce((acc, s) => acc + s.cantidad, 0) || 0;
      const stockNuevos =
        p.producto_variantes?.reduce((acc, v) => acc + v.stock, 0) || 0;
      const stockTotal = stockViejos + stockNuevos;

      if (config?.mostrar_sin_stock === false && stockTotal <= 0) return;

      const catKey = (
        p.categoria_id ||
        p.tipo ||
        "sin-categoria"
      ).toLowerCase();
      conteos[catKey] = (conteos[catKey] || 0) + 1;
    });
    return conteos;
  }, [productos, config]);

  const categoriasConStock = useMemo<CategoriaConStock[]>(() => {
    if (!categorias || categorias.length === 0) {
      return Object.entries(conteosRaw)
        .map(([k, v]) => {
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

          return { id: k, nombre: fallbackName, count: v };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    return categorias
      .map((cat) => {
        const count =
          (conteosRaw[cat.id.toLowerCase()] || 0) +
          (conteosRaw[(cat.slug || "").toLowerCase()] || 0) +
          (conteosRaw[(cat.nombre || "").toLowerCase()] || 0);
        return { id: cat.id, nombre: cat.nombre, count };
      })
      .filter((cat) => cat.count > 0);
  }, [categorias, conteosRaw, productos]);

  const productosFiltrados = useMemo(() => {
    const resultado = productos.filter((c) => {
      const stockViejos = c.stock?.reduce((acc, s) => acc + s.cantidad, 0) || 0;
      const stockNuevos =
        c.producto_variantes?.reduce((acc, v) => acc + v.stock, 0) || 0;
      const stockTotal = stockViejos + stockNuevos;

      if (config?.mostrar_sin_stock === false && stockTotal <= 0) return false;

      const nombreStr = c.nombre || "";
      const tipoStr = c.tipo || "";
      const catIdStr = c.categoria_id || "";

      const matchSearch = nombreStr
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      const catObj = categorias?.find((cat) => cat.id === tipo);
      const matchTipo =
        tipo === "todos" ||
        catIdStr === tipo ||
        tipoStr.toLowerCase() === tipo.toLowerCase() ||
        (catObj && catObj.slug?.toLowerCase() === tipoStr.toLowerCase()) ||
        (catObj && catObj.nombre?.toLowerCase() === tipoStr.toLowerCase());

      //  LÓGICA DE FILTRADO MULTI-DIMENSIÓN (JSONB NATIVO)
      const matchVariante = Object.entries(filtrosVariantes).every(
        ([propKey, propVal]) => {
          if (propVal === "todos") return true;

          // 1. Chequear tabla nueva
          const matchNew =
            c.producto_variantes?.some((pv) => {
              if (pv.stock <= 0) return false;

              if (pv.atributos && Object.keys(pv.atributos).length > 0) {
                return (
                  pv.atributos[propKey]?.toLowerCase() === propVal.toLowerCase()
                );
              }

              // Auto-Split al vuelo
              const parsed = parseLegacyVariant(pv.nombre_display || "");
              return parsed[propKey]?.toLowerCase() === propVal.toLowerCase();
            }) ?? false;

          // 2. Chequear tabla vieja (Auto-Split al vuelo)
          const matchOld =
            c.stock?.some((s) => {
              if (s.cantidad <= 0) return false;
              const parsed = parseLegacyVariant(s.variante || "");
              return parsed[propKey]?.toLowerCase() === propVal.toLowerCase();
            }) ?? false;

          return matchOld || matchNew;
        },
      );

      return matchSearch && matchTipo && matchVariante;
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
    searchQuery,
    tipo,
    filtrosVariantes,
    orden,
    config,
    categorias,
  ]);

  const productosVisibles = productosFiltrados.slice(0, visibleCount);
  const hayMasProductos = visibleCount < productosFiltrados.length;

  const hayFiltrosActivos =
    tipo !== "todos" ||
    orden !== "mas_vendidos" ||
    searchQuery !== "" ||
    Object.values(filtrosVariantes).some((v) => v !== "todos");

  return {
    propiedadesGlobales,
    categoriasConStock,
    productosFiltrados,
    productosVisibles,
    hayMasProductos,
    hayFiltrosActivos,
  };
}
