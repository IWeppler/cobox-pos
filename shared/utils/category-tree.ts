export type CategoriaBase = {
  id: string;
  nombre: string;
  slug: string;
  parent_id: string | null;
};

export type CategoriaConCount = {
  id: string;
  nombre: string;
  slug: string;
  count: number;
};

export type PadreConHijos = CategoriaConCount & { hijos: CategoriaConCount[] };

export type ArbolCategorias = {
  padres: PadreConHijos[];
  sinPadre: CategoriaConCount[];
};

/**
 * Agrupa categorías planas (parent_id nullable) en un árbol de 2 niveles,
 * tolerante a estado mixto: algunos padres con hijos, otras categorías
 * sueltas sin padre, o (Evens hoy) TODO sin padre — nunca asume que el
 * árbol está completo.
 *
 * Recibe DOS mapas de conteo, mismo criterio que ya usaba
 * categoriasConStock: `countsExistencia` (típicamente solo con el filtro
 * de stock aplicado) decide si un padre/categoría existe como chip;
 * `countsMostrados` (típicamente con búsqueda+variante también aplicados
 * — "facetado") es el número que se muestra. Así un chip no aparece y
 * desaparece mientras se tipea una búsqueda que no matchea nada ahí
 * adentro, solo cambia su número a 0.
 *
 * Reglas:
 * - Una categoría raíz (parent_id null) es "padre" solo si tiene al menos
 *   un hijo con existencia > 0. Si no, es una categoría normal (bucket
 *   `sinPadre`) — evita mostrar un nivel 2 vacío para una categoría recién
 *   promovida a padre sin subcategorías activas todavía.
 * - count de un padre = su propio count + suma de los counts de sus
 *   hijos (existencia y mostrado se calculan igual, cada uno con su mapa).
 * - Categorías (padre o hija) sin ninguna existencia se descartan.
 * - Árbol 100% plano → `padres: []`, todo en `sinPadre`.
 */
export function construirArbolCategorias(
  categorias: CategoriaBase[],
  countsExistencia: Record<string, number>,
  countsMostrados: Record<string, number> = countsExistencia,
): ArbolCategorias {
  const hijosPorPadreId = new Map<string, CategoriaBase[]>();
  for (const cat of categorias) {
    if (!cat.parent_id) continue;
    if (!hijosPorPadreId.has(cat.parent_id)) hijosPorPadreId.set(cat.parent_id, []);
    hijosPorPadreId.get(cat.parent_id)!.push(cat);
  }

  const padres: PadreConHijos[] = [];
  const sinPadre: CategoriaConCount[] = [];

  for (const cat of categorias) {
    if (cat.parent_id) continue; // se procesa como hijo de su padre, no acá

    const hijosRaw = hijosPorPadreId.get(cat.id) ?? [];
    const hijos: CategoriaConCount[] = hijosRaw
      .filter((h) => (countsExistencia[h.id] ?? 0) > 0)
      .map((h) => ({
        id: h.id,
        nombre: h.nombre,
        slug: h.slug,
        count: countsMostrados[h.id] ?? 0,
      }));

    const existenciaPropia = countsExistencia[cat.id] ?? 0;
    const mostradoPropio = countsMostrados[cat.id] ?? 0;

    if (hijos.length > 0) {
      const existenciaTotal =
        existenciaPropia +
        hijosRaw.reduce((sum, h) => sum + (countsExistencia[h.id] ?? 0), 0);
      if (existenciaTotal > 0) {
        padres.push({
          id: cat.id,
          nombre: cat.nombre,
          slug: cat.slug,
          count: mostradoPropio + hijos.reduce((sum, h) => sum + h.count, 0),
          hijos,
        });
      }
      continue;
    }

    if (existenciaPropia > 0) {
      sinPadre.push({ id: cat.id, nombre: cat.nombre, slug: cat.slug, count: mostradoPropio });
    }
  }

  return { padres, sinPadre };
}

export type ResolucionCategoria = { padreId: string; hijoId: string | null };

/**
 * Resuelve un slug o id (típicamente de la URL) contra la lista PLANA de
 * categorías — deliberadamente sin stock/conteos: un link viejo a una
 * categoría hoy sin stock igual debe resolver a la identidad correcta,
 * aunque el resultado final termine sin productos para mostrar. Por eso
 * vive separado de `construirArbolCategorias` (que sí filtra por stock)
 * y no depende de él — evita una dependencia circular en los callers que
 * necesitan resolver la URL ANTES de poder calcular conteos.
 */
export function resolverCategoriaPorSlug(
  categorias: CategoriaBase[],
  slugOrId: string,
): ResolucionCategoria | null {
  if (!slugOrId) return null;
  const key = slugOrId.toLowerCase();
  const matches = (c: CategoriaBase) =>
    c.id.toLowerCase() === key || c.slug.toLowerCase() === key;

  const directa = categorias.find(matches);
  if (!directa) return null;

  if (!directa.parent_id) return { padreId: directa.id, hijoId: null };
  return { padreId: directa.parent_id, hijoId: directa.id };
}

/**
 * Label para mostrar la categoría de un producto en una sola columna
 * combinada (ej. tabla de stock): "Padre › Hijo" si la categoría del
 * producto tiene padre, o solo "Nombre" si es una categoría raíz (incluida
 * una de las pendientes de migración, sin padre todavía). Contra la lista
 * PLANA de categorías, sin conteos — misma razón que resolverCategoriaPorSlug.
 */
export function resolverCategoriaDisplayLabel(
  categorias: CategoriaBase[],
  categoriaId: string | null | undefined,
): string {
  if (!categoriaId) return "";
  const categoria = categorias.find((c) => c.id === categoriaId);
  if (!categoria) return "";

  if (!categoria.parent_id) return categoria.nombre;

  const padre = categorias.find((c) => c.id === categoria.parent_id);
  return padre ? `${padre.nombre} › ${categoria.nombre}` : categoria.nombre;
}

/** Aplana el árbol de vuelta a una lista simple — para callers que todavía
 * no necesitan la jerarquía (ej. selects planos de categoría). */
export function aplanarArbolCategorias(arbol: ArbolCategorias): CategoriaConCount[] {
  return [
    ...arbol.padres.map((padre) => ({
      id: padre.id,
      nombre: padre.nombre,
      slug: padre.slug,
      count: padre.count,
    })),
    ...arbol.padres.flatMap((p) => p.hijos),
    ...arbol.sinPadre,
  ];
}
