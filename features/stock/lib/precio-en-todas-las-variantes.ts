/**
 * "Usar este precio en todas las variantes", y su deshacer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA REGLA, QUE ES LO ÚNICO QUE IMPORTA ACÁ: SE VACÍA, NO SE COPIA.
 *
 * `producto_variantes.precio` en null significa "el precio es el del
 * producto" — así lo resuelven el POS, el catálogo público y create-sale
 * (`variante.precio ?? producto.precio`). Así que "que todas usen el precio
 * del producto" se logra BORRÁNDOLES el precio propio, no escribiéndoles el
 * número.
 *
 * Copiar el número se vería idéntico en pantalla el mismo día y volvería a
 * fabricar el bug: la copia se queda con el precio viejo la próxima vez que
 * cambie el del producto, y en la venta le gana a la cabecera. Es exactamente
 * lo que hacía la actualización masiva de precios hasta el 8/9/2026 —1.252
 * copias en los cuatro negocios— y lo que dejó a "Pantalon sastrero HHP" con
 * $52.000 en /stock y $20.000 en la caja.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Puras y sin estado: operan sobre el record de datos de variantes del
 * formulario. El snapshot se toma ANTES de vaciar y por fuera de cualquier
 * updater de setState — leerlo adentro sería leerlo tarde, y en StrictMode
 * dos veces.
 */

/** El valor de un campo por clave de variante. `""` = sin valor propio. */
export type ValoresPorVariante = Record<string, string>;

export function snapshotCampo<T extends Record<string, unknown>>(
  variantes: Array<{ key: string } & Partial<Record<keyof T, unknown>>>,
  campo: keyof T,
): ValoresPorVariante {
  const previos: ValoresPorVariante = {};
  for (const v of variantes) {
    const valor = v[campo];
    previos[v.key] = valor === null || valor === undefined ? "" : String(valor);
  }
  return previos;
}

export function vaciarCampo<T extends Record<string, unknown>>(
  datos: Record<string, T>,
  campo: keyof T,
): Record<string, T> {
  const siguiente: Record<string, T> = {};
  for (const [key, fila] of Object.entries(datos)) {
    siguiente[key] = { ...fila, [campo]: "" };
  }
  return siguiente;
}

/**
 * El deshacer. Solo toca las claves que siguen existiendo: si entre el aplicar
 * y el deshacer se destildó una combinación, restaurarle el precio a una fila
 * que ya no está la resucitaría en el payload.
 */
export function restaurarCampo<T extends Record<string, unknown>>(
  datos: Record<string, T>,
  campo: keyof T,
  previos: ValoresPorVariante,
): Record<string, T> {
  const siguiente: Record<string, T> = { ...datos };
  for (const [key, valor] of Object.entries(previos)) {
    if (!siguiente[key]) continue;
    siguiente[key] = { ...siguiente[key], [campo]: valor };
  }
  return siguiente;
}
