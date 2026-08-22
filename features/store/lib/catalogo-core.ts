import type { Producto } from "@/entities/productos/types";
import { construirArbolCategorias } from "@/shared/utils/category-tree";
import {
  construirPortadaCategorias,
  recienLlegados,
  type EntradaPortada,
} from "./portada-catalogo";

/**
 * El núcleo del catálogo, sin React.
 *
 * Existe porque las mismas dos preguntas —"¿este producto se ve?" y "¿a qué
 * categoría pertenece?"— hay que responderlas en DOS lados: en el navegador
 * (el hook `useCatalogFilters`, que filtra en vivo) y en el server (que arma
 * la portada sin mandar el catálogo entero al cliente). Estaban solo adentro
 * del hook, envueltas en `useCallback`, así que el server no podía llamarlas.
 *
 * La regla es que estas funciones son la ÚNICA definición: el hook las importa
 * en vez de tener su propia copia. Dos implementaciones de "a qué categoría
 * pertenece este producto" terminan en una portada que cuenta distinto que la
 * grilla, y ese es el bug que nadie reporta porque no se ve como un error.
 */

export interface CategoriaCatalogo {
  id: string;
  nombre: string;
  slug?: string | null;
  parent_id?: string | null;
}

export interface ConfigVisibilidad {
  mostrar_sin_stock?: boolean;
}

/**
 * ¿Este producto se muestra?
 *
 * Suma el stock de las variantes (fuente canónica) y el del espejo legacy.
 * Solo esconde cuando el comercio pidió no mostrar sin stock; el default es
 * mostrar todo.
 */
export function crearPasaFiltroStock(config?: ConfigVisibilidad | null) {
  return (p: Producto): boolean => {
    const stockViejos = p.stock?.reduce((acc, s) => acc + s.cantidad, 0) || 0;
    const stockNuevos =
      p.producto_variantes?.reduce(
        (acc, v) => acc + (v.stock_disponible ?? v.stock),
        0,
      ) || 0;
    const stockTotal = stockViejos + stockNuevos;
    return !(config?.mostrar_sin_stock === false && stockTotal <= 0);
  };
}

/**
 * A qué categoría pertenece un producto.
 *
 * Acepta las tres formas que conviven en la base: `categoria_id` real, y los
 * legacy que solo traen `tipo` (texto libre) matcheando por nombre o slug de
 * una categoría real. El último recurso es la clave cruda, para que un
 * producto sin categoría siga contándose en algún lado en vez de desaparecer.
 */
export function crearResolverCategoriaId(categorias: CategoriaCatalogo[]) {
  const porClave = new Map<string, string>();
  for (const cat of categorias) {
    porClave.set(cat.id.toLowerCase(), cat.id);
    if (cat.slug) porClave.set(cat.slug.toLowerCase(), cat.id);
    if (cat.nombre) porClave.set(cat.nombre.toLowerCase(), cat.id);
  }

  return (p: Producto): string => {
    const porId = p.categoria_id
      ? porClave.get(p.categoria_id.toLowerCase())
      : undefined;
    if (porId) return porId;
    const porTipo = p.tipo ? porClave.get(p.tipo.toLowerCase()) : undefined;
    if (porTipo) return porTipo;
    return (p.categoria_id || p.tipo || "sin-categoria").toLowerCase();
  };
}

/** Lo que la portada necesita para dibujarse, y nada más. */
export interface PortadaCatalogo {
  categorias: EntradaPortada[];
  recientes: Producto[];
  totalProductos: number;
}

/**
 * La portada, calculada en el server.
 *
 * Por qué se puede calcular acá y no hace falta el hook entero: la portada
 * solo existe cuando NO hay búsqueda, ni categoría elegida, ni filtros de
 * variante (ver `esModoPortada`). En ese estado el conteo facetado y el total
 * son el mismo número, así que alcanza con contar una vez — no es una
 * simplificación optimista, es la definición del modo portada.
 *
 * Devuelve 8 productos (`recienLlegados`) y una tarjeta por categoría. Eso es
 * lo que se manda al navegador para el primer render, en lugar de los 1.183
 * productos con sus 3.164 variantes que se mandaban antes para dibujar
 * exactamente lo mismo.
 */
export function calcularPortada(params: {
  productos: Producto[];
  categorias: CategoriaCatalogo[];
  config?: ConfigVisibilidad | null;
  /** Portada elegida a mano en Configuración → Categorías, por categoria_id. */
  imagenPorCategoriaId?: Map<string, string | null>;
}): PortadaCatalogo {
  const { productos, categorias, config, imagenPorCategoriaId } = params;

  const pasaFiltroStock = crearPasaFiltroStock(config);
  const resolverCategoriaId = crearResolverCategoriaId(categorias);

  const visibles = productos.filter(pasaFiltroStock);

  const conteos: Record<string, number> = {};
  for (const p of visibles) {
    const clave = resolverCategoriaId(p);
    conteos[clave] = (conteos[clave] || 0) + 1;
  }

  const arbol = construirArbolCategorias(
    categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      slug: c.slug || "",
      parent_id: c.parent_id ?? null,
    })),
    conteos,
  );

  // Un padre no tiene productos propios: su rama son él y sus hijos. Las
  // sueltas entran como una rama de uno. Mismo criterio que la versión
  // cliente — si esto cambia, cambia en los dos lados.
  const entradas = [
    ...arbol.padres.map((padre) => ({
      id: padre.id,
      nombre: padre.nombre,
      count: padre.count,
      idsRama: [padre.id, ...padre.hijos.map((h) => h.id)],
      imagenConfigurada: imagenPorCategoriaId?.get(padre.id) ?? null,
    })),
    ...arbol.sinPadre.map((cat) => ({
      id: cat.id,
      nombre: cat.nombre,
      count: cat.count,
      idsRama: [cat.id],
      imagenConfigurada: imagenPorCategoriaId?.get(cat.id) ?? null,
    })),
  ];

  return {
    categorias: construirPortadaCategorias({
      entradas,
      productos: visibles,
      resolverCategoriaId,
    }),
    recientes: recienLlegados(visibles),
    totalProductos: visibles.length,
  };
}
