/**
 * El negocio activo va SIEMPRE al final de la clave de las listas que dependen
 * de él. Al final y no al principio para que la invalidación por prefijo
 * (`["pos","productos"]`) siga alcanzando a todas las variantes.
 *
 * Sin esto, cambiar de negocio dejaba a Vender/Inventario/Clientes mostrando el
 * catálogo del negocio anterior hasta recargar a mano: `router.refresh()`
 * re-renderiza el server, pero no toca el cache de React Query, que vive en el
 * cliente y sobrevive al refresh.
 */
export function conNegocio<T extends readonly unknown[]>(
  clave: T,
  negocioId: string | null | undefined,
) {
  return [...clave, negocioId ?? "sin-negocio"] as const;
}

export const queryKeys = {
  pos: {
    productos: ["pos", "productos"] as const,
  },
  stock: {
    index: ["stock", "index"] as const,
    detalle: (productoId: string) => ["stock", "detalle", productoId] as const,
  },
  clientes: {
    listado: ["clientes", "listado"] as const,
    detalle: (clienteId: string) => ["clientes", "detalle", clienteId] as const,
  },
  categorias: {
    atributos: (categoriaId: string) =>
      ["categorias", "atributos", categoriaId] as const,
  },
};

/**
 * configuracion_pos viaja dentro de las 3 queries de catálogo (posName en
 * las tres, mostrar_sin_stock/permitir_venta_sin_stock en pos y stock,
 * cc_anticipo_default/recargo_mora en clientes). Cualquier guardado en
 * Configuración debe invalidar estas tres para no esperar el staleTime.
 */
export const CATALOG_QUERY_KEYS = [
  queryKeys.pos.productos,
  queryKeys.stock.index,
  queryKeys.clientes.listado,
] as const;
