import type { AccionImport, ItemPlan } from "./import-productos-plan";

/**
 * Filtros de la preview del import.
 *
 * Con 3000 filas la tabla completa no sirve para nada: lo que el usuario
 * necesita ver primero son las filas que NO se van a importar, y después las
 * que se importan tomando una decisión que conviene mirar. El resto es
 * confirmación de que todo salió como esperaba.
 *
 * Vive acá y no en el componente para poder testear los conteos: son lo que
 * el usuario lee para decidir si aprueba, y una fila con error Y aviso no
 * puede contarse dos veces en "error".
 */

export type FiltroPreview =
  | "todas"
  | "error"
  | "aviso"
  | "cambiadas"
  | "imei"
  | AccionImport;

export function coincideFiltro(
  item: ItemPlan,
  filtro: FiltroPreview,
  filasCambiadas?: ReadonlySet<number>,
): boolean {
  switch (filtro) {
    case "todas":
      return true;
    case "error":
      return item.errores.length > 0;
    // "Para revisar" es solo aviso: una fila bloqueada ya está contada en
    // error y aparecer en las dos listas hace que los números no cierren.
    case "aviso":
      return item.avisos.length > 0 && item.errores.length === 0;
    case "cambiadas":
      return filasCambiadas?.has(item.fila) ?? false;
    case "imei":
      return Boolean(item.imei);
    default:
      // Las acciones describen lo que se va a escribir: una fila bloqueada no
      // se escribe, así que no cuenta como "producto nuevo".
      return item.accion === filtro && item.errores.length === 0;
  }
}

export function filtrarItems(
  items: readonly ItemPlan[],
  filtro: FiltroPreview,
  filasCambiadas?: ReadonlySet<number>,
): ItemPlan[] {
  return items.filter((i) => coincideFiltro(i, filtro, filasCambiadas));
}

export function contarFiltros(
  items: readonly ItemPlan[],
  filasCambiadas?: ReadonlySet<number>,
): Record<FiltroPreview, number> {
  const conteo: Record<FiltroPreview, number> = {
    todas: items.length,
    error: 0,
    aviso: 0,
    cambiadas: 0,
    imei: 0,
    CREAR_PRODUCTO: 0,
    CREAR_VARIANTE: 0,
    SUMAR_STOCK: 0,
  };

  for (const item of items) {
    for (const filtro of Object.keys(conteo) as FiltroPreview[]) {
      if (filtro === "todas") continue;
      if (coincideFiltro(item, filtro, filasCambiadas)) conteo[filtro] += 1;
    }
  }

  return conteo;
}
