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

/**
 * Qué queries se guardan en el celular para poder abrir la app sin señal
 * (ver `shared/lib/cache-offline.ts`).
 *
 * La lista es CORTA a propósito y es una decisión de plata, no de
 * performance: entra el catálogo —lo que hace falta para consultar un precio
 * o ver si hay stock— y NO entra nada que el comercio use para cobrar. Caja,
 * turnos y el listado de clientes (que trae los saldos de cuenta corriente)
 * quedan afuera: una foto vieja de un saldo no es un dato incompleto, es un
 * dato equivocado, y alguien lo usa para cobrar.
 *
 * `stock.detalle` tampoco entra: es por producto y solo hace falta con el
 * sheet de edición abierto, que es justo cuando SÍ se necesita estar online
 * para guardar.
 */
const QUERIES_PERSISTIBLES: readonly (readonly string[])[] = [
  queryKeys.pos.productos,
  queryKeys.stock.index,
];

export function esQueryPersistible(clave: readonly unknown[]): boolean {
  return QUERIES_PERSISTIBLES.some((persistible) =>
    persistible.every((parte, indice) => clave[indice] === parte),
  );
}
