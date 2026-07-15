interface ReservaActivaRow {
  variante_id: string;
}

/** Agrupa reservas ACTIVAS por variante_id — cada fila de `reservas` representa 1 unidad. */
export function contarReservasActivasPorVariante(
  reservas: ReservaActivaRow[] | null | undefined,
): Record<string, number> {
  const conteo: Record<string, number> = {};
  for (const r of reservas ?? []) {
    conteo[r.variante_id] = (conteo[r.variante_id] || 0) + 1;
  }
  return conteo;
}

/**
 * `stock` es el físico real (columna producto_variantes.stock, no se toca).
 * `stock_disponible` es lo que puede ofrecerse para vender — descuenta las
 * unidades con una reserva ACTIVA. Nunca baja de 0 aunque el conteo de
 * reservas quede desincronizado del stock físico.
 */
export function calcularStockDisponible(
  stock: number,
  varianteId: string | null | undefined,
  reservasPorVariante: Record<string, number>,
): number {
  if (!varianteId) return stock;
  const reservado = reservasPorVariante[varianteId] || 0;
  return Math.max(0, stock - reservado);
}

interface VarianteConStock {
  id: string;
  stock: number;
}

/** Adjunta `stock_disponible` a cada variante sin pisar `stock`. */
export function anotarStockDisponible<T extends VarianteConStock>(
  variantes: T[] | null | undefined,
  reservasPorVariante: Record<string, number>,
): (T & { stock_disponible: number })[] {
  return (variantes ?? []).map((v) => ({
    ...v,
    stock_disponible: calcularStockDisponible(v.stock, v.id, reservasPorVariante),
  }));
}
