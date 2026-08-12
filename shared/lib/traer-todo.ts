/**
 * Trae TODAS las filas de una consulta de Supabase, en páginas.
 *
 * Por qué existe: PostgREST tiene un tope de filas por respuesta (`max-rows`,
 * 1000 en Supabase) y lo aplica EN SILENCIO. No hay error, no hay warning: la
 * consulta devuelve 200 con las primeras 1000 filas y el resto no existe para
 * el que llamó. `.limit(5000)` no lo levanta — el tope es del servidor.
 *
 * Lo que costó descubrirlo (12/8/2026): el catálogo de Evens pedía sus
 * productos sin paginar. Con 1.116 publicados y orden por `creado_en` desc, los
 * 116 más viejos desaparecieron de la tienda Y del POS — invendibles, porque
 * tampoco salían en la búsqueda de la terminal. La dueña lo reportó como "se
 * borraron las camperas de niño". No se había borrado nada: eran las más
 * viejas. Y el problema no era solo el catálogo: el importador y el matcher de
 * remitos leen `producto_variantes` (2.965 filas) y `diccionario_alias` (1.004)
 * igual de crudo, así que veían un tercio del catálogo y no reconocían lo que
 * ya existía — o sea, creaban duplicados.
 *
 * Regla: cualquier consulta que pueda devolver más de 1000 filas pasa por acá.
 * Si el conjunto es chico y acotado por naturaleza (una venta, un producto por
 * slug, `.in(ids)` sobre una selección del usuario), no hace falta.
 */

/** Tope de filas por respuesta de PostgREST. No es configurable desde el cliente. */
export const TAMANO_PAGINA = 1000;

/**
 * Freno duro. 30 páginas = 30.000 filas: más que eso, algo raro está pasando
 * (un filtro que se perdió, un negocio que creció un orden de magnitud) y es
 * mejor loguearlo y servir parcial que colgar la request para siempre.
 */
const MAX_PAGINAS = 30;

interface RespuestaPagina<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

/**
 * @param etiqueta Para el log. Que se entienda qué consulta se truncó.
 * @param pagina Fábrica de consultas: recibe el rango y devuelve la promesa de
 *   supabase-js. Es una fábrica y no una consulta porque un query builder ya
 *   ejecutado no se puede reusar para pedir la página siguiente.
 *
 * Si el `select` incluye `{ count: "exact" }`, se usa el total para pedir el
 * resto de las páginas EN PARALELO. Si no viene, cae a un bucle secuencial que
 * corta cuando una página vuelve incompleta — funciona igual, solo que más
 * lento.
 */
export async function traerTodo<T>(
  etiqueta: string,
  pagina: (desde: number, hasta: number) => PromiseLike<RespuestaPagina<T>>,
): Promise<{ data: T[]; error: string | null; total: number }> {
  const primera = await pagina(0, TAMANO_PAGINA - 1);

  if (primera.error) {
    console.error(`[TRAER TODO] ${etiqueta}:`, primera.error);
    return { data: [], error: primera.error.message, total: 0 };
  }

  const filas = [...(primera.data ?? [])];

  // Se terminó en la primera página: el caso común y el más barato.
  if (filas.length < TAMANO_PAGINA) {
    return { data: filas, error: null, total: filas.length };
  }

  const total = primera.count ?? null;

  if (total !== null) {
    const paginasTotales = Math.ceil(total / TAMANO_PAGINA);

    if (paginasTotales > MAX_PAGINAS) {
      console.error(
        `[TRAER TODO] ${etiqueta}: ${total} filas superan el tope de ${MAX_PAGINAS} páginas; se sirve parcial.`,
      );
    }

    const restantes = Math.min(paginasTotales, MAX_PAGINAS) - 1;
    if (restantes <= 0) return { data: filas, error: null, total: filas.length };

    const paginas = await Promise.all(
      Array.from({ length: restantes }, (_, i) => {
        const desde = (i + 1) * TAMANO_PAGINA;
        return pagina(desde, desde + TAMANO_PAGINA - 1);
      }),
    );

    for (const p of paginas) {
      if (p.error) {
        // Media lista es peor que ninguna: con un catálogo incompleto el
        // importador crea duplicados y el POS no encuentra qué vender.
        console.error(`[TRAER TODO] ${etiqueta}:`, p.error);
        return { data: [], error: p.error.message, total: 0 };
      }
      filas.push(...(p.data ?? []));
    }

    return { data: filas, error: null, total: filas.length };
  }

  // Sin count: de a una hasta que una página vuelva incompleta.
  for (let n = 1; n < MAX_PAGINAS; n++) {
    const desde = n * TAMANO_PAGINA;
    const siguiente = await pagina(desde, desde + TAMANO_PAGINA - 1);

    if (siguiente.error) {
      console.error(`[TRAER TODO] ${etiqueta}:`, siguiente.error);
      return { data: [], error: siguiente.error.message, total: 0 };
    }

    const lote = siguiente.data ?? [];
    filas.push(...lote);
    if (lote.length < TAMANO_PAGINA) {
      return { data: filas, error: null, total: filas.length };
    }
  }

  console.error(
    `[TRAER TODO] ${etiqueta}: se alcanzó el tope de ${MAX_PAGINAS} páginas; se sirve parcial.`,
  );
  return { data: filas, error: null, total: filas.length };
}
