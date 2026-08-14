import type {
  MovimientoStock,
  TipoMovimiento,
} from "@/features/stock/actions/get-movimientos-stock";

/**
 * Filtrado, agrupación por remito y paginación de los movimientos de stock.
 *
 * Puro: recibe la lista ya traída y devuelve lo que se muestra. La pantalla
 * carga un rango de fechas del server y todo lo demás —buscar, filtrar por
 * tipo, cambiar de página— pasa en memoria: a este volumen (cientos de filas
 * por período) una ida al server por tecla tipeada es peor experiencia que
 * filtrar el array.
 */

export const FILAS_POR_PAGINA = 50;

/** De dónde viene el movimiento. Se deriva del texto de `origen` porque las
 * cinco fuentes ya lo escriben con un prefijo estable; agregar una columna
 * nueva a cinco consultas para repetir lo mismo sería peor. */
export type OrigenMovimiento =
  | "remito"
  | "venta"
  | "devolucion"
  | "baja"
  | "ajuste";

export function clasificarOrigen(mov: MovimientoStock): OrigenMovimiento {
  if (mov.remitoId) return "remito";
  if (mov.origen.startsWith("Devolución")) return "devolucion";
  if (mov.origen.startsWith("Venta")) return "venta";
  if (mov.origen.startsWith("Baja")) return "baja";
  return "ajuste";
}

export const ETIQUETA_ORIGEN: Record<OrigenMovimiento, string> = {
  remito: "Remitos",
  venta: "Ventas",
  devolucion: "Devoluciones",
  baja: "Bajas",
  ajuste: "Ajustes manuales",
};

export interface FiltrosMovimientos {
  busqueda: string;
  tipo: TipoMovimiento | "todos";
  origen: OrigenMovimiento | "todos";
}

export function filtrarMovimientos(
  movimientos: MovimientoStock[],
  filtros: FiltrosMovimientos,
): MovimientoStock[] {
  const busqueda = filtros.busqueda.trim().toLowerCase();

  return movimientos.filter((mov) => {
    if (filtros.tipo !== "todos" && mov.tipo !== filtros.tipo) return false;
    if (filtros.origen !== "todos" && clasificarOrigen(mov) !== filtros.origen) {
      return false;
    }
    if (!busqueda) return true;

    // Se busca también en origen y usuario: "quién dio de baja esto" y "qué
    // trajo tal proveedor" son las dos preguntas reales de esta pantalla, y
    // buscar solo por producto no las responde.
    return (
      mov.producto.toLowerCase().includes(busqueda) ||
      mov.variante.toLowerCase().includes(busqueda) ||
      mov.origen.toLowerCase().includes(busqueda) ||
      (mov.usuario ?? "").toLowerCase().includes(busqueda)
    );
  });
}

export interface RemitoAgrupado {
  remitoId: string;
  proveedor: string;
  fecha: string;
  /** Líneas del remito, que NO es lo mismo que unidades. */
  lineas: number;
  unidades: number;
  productos: number;
  items: MovimientoStock[];
}

/**
 * Los ingresos por remito, agrupados por remito.
 *
 * Un remito de 347 líneas en la lista plana es 347 filas seguidas que tapan
 * todo lo demás del día. Agrupado es una fila que se abre.
 */
export function agruparPorRemito(
  movimientos: MovimientoStock[],
): RemitoAgrupado[] {
  const porRemito = new Map<string, RemitoAgrupado>();

  for (const mov of movimientos) {
    if (!mov.remitoId) continue;

    const actual = porRemito.get(mov.remitoId);
    if (actual) {
      actual.lineas += 1;
      actual.unidades += mov.cantidad;
      actual.items.push(mov);
      continue;
    }

    porRemito.set(mov.remitoId, {
      remitoId: mov.remitoId,
      proveedor: mov.proveedor ?? "Sin proveedor",
      fecha: mov.fecha,
      lineas: 1,
      unidades: mov.cantidad,
      productos: 0,
      items: [mov],
    });
  }

  return [...porRemito.values()]
    .map((remito) => ({
      ...remito,
      // Productos DISTINTOS, no líneas: un remito puede traer el mismo
      // producto en seis talles y son seis líneas de un solo producto.
      productos: new Set(remito.items.map((i) => i.productoId)).size,
    }))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export interface Paginado<T> {
  filas: T[];
  pagina: number;
  totalPaginas: number;
  desde: number;
  hasta: number;
  total: number;
}

export function paginar<T>(
  filas: T[],
  pagina: number,
  porPagina = FILAS_POR_PAGINA,
): Paginado<T> {
  const total = filas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  // Se corrige la página fuera de rango en vez de devolver vacío: pasa siempre
  // que se filtra estando en la página 5 y el resultado tiene dos páginas.
  const actual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (actual - 1) * porPagina;

  return {
    filas: filas.slice(inicio, inicio + porPagina),
    pagina: actual,
    totalPaginas,
    desde: total === 0 ? 0 : inicio + 1,
    hasta: Math.min(inicio + porPagina, total),
    total,
  };
}

export interface ResumenMovimientos {
  ingresos: number;
  egresos: number;
  neto: number;
}

/** Unidades que entraron y salieron. El neto puede ser negativo y así se
 * muestra: es la pregunta "¿se está vaciando el depósito?". */
export function resumirMovimientos(
  movimientos: MovimientoStock[],
): ResumenMovimientos {
  let ingresos = 0;
  let egresos = 0;

  for (const mov of movimientos) {
    if (mov.tipo === "INGRESO") ingresos += mov.cantidad;
    else egresos += mov.cantidad;
  }

  return { ingresos, egresos, neto: ingresos - egresos };
}
