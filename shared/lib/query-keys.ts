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
