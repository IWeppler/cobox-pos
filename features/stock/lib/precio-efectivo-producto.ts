import { formatearMoneda } from "@/shared/utils/formatters";

/**
 * Qué precio (o costo) mostrar de un producto en /stock.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES `productos.precio`
 *
 * Un producto tiene dos precios: el de cabecera (`productos.precio`) y el de
 * cada variante (`producto_variantes.precio`, null = hereda). En la venta gana
 * la variante — `variante.precio ?? producto.precio`, la misma cascada en el
 * POS, el catálogo público y create-sale.
 *
 * La tabla de /stock ya calculaba un rango cuando las variantes NO eran
 * uniformes, pero cuando todas coincidían entre sí caía a mostrar el de
 * cabecera. Ese es exactamente el caso que reportó Evelyn el 8/9/2026:
 * "Pantalon sastrero HHP" tenía las 7 variantes en $20.000 y la cabecera en
 * $52.000, y el listado mostraba $52.000. Uniforme no quiere decir igual al
 * producto.
 *
 * Con un solo variante pasaba lo mismo por otro camino: el rango solo se
 * calculaba con más de una.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MISMA REGLA QUE LA BASE
 *
 * Es la contraparte en TypeScript de la vista `productos_precio_efectivo`
 * (20260908180000), que usa la conciliación de remitos. Las dos tienen que
 * decir lo mismo: hay precio único cuando todas las variantes coinciden — sea
 * porque heredan, sea porque dicen el mismo número — y si no, no hay UN precio
 * y se muestra el rango. Nunca un promedio: inventar un número que nadie fijó
 * es el mismo error al revés.
 *
 * Es pura y sin IO: recibe los valores ya resueltos.
 */

export interface PrecioMostrable {
  /** El número a mostrar cuando hay uno solo. Con rango, el mínimo. */
  valor: number;
  min: number;
  max: number;
  /** Todas las variantes consideradas dicen lo mismo. */
  uniforme: boolean;
  /**
   * Lo que se cobra NO es lo que dice la cabecera del producto. Es el aviso
   * que /stock necesita: la persona va a corregir el precio donde lo lee, y
   * ahí no es donde está.
   */
  difiereDeCabecera: boolean;
}

const numeroONulo = (
  valor: number | string | null | undefined,
): number | null => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param cabecera `productos.precio` (o `precio_costo`).
 * @param variantes El valor PROPIO de cada variante; null/undefined = hereda.
 *   Lista vacía = producto sin variantes, manda la cabecera.
 */
export function precioMostrable(
  cabecera: number | string | null | undefined,
  variantes: Array<number | string | null | undefined>,
): PrecioMostrable {
  const base = numeroONulo(cabecera) ?? 0;

  if (variantes.length === 0) {
    return {
      valor: base,
      min: base,
      max: base,
      uniforme: true,
      difiereDeCabecera: false,
    };
  }

  const efectivos = variantes.map((v) => numeroONulo(v) ?? base);
  const min = Math.min(...efectivos);
  const max = Math.max(...efectivos);
  const uniforme = min === max;

  return {
    valor: min,
    min,
    max,
    uniforme,
    // Con rango también difiere: ninguno de los dos extremos es "el precio del
    // producto", así que la cabecera tampoco describe lo que se cobra.
    difiereDeCabecera: !uniforme || min !== base,
  };
}

/**
 * El precio de un producto listo para mostrar: un número, o el rango cuando
 * sus variantes no coinciden.
 *
 * Vive acá y no en cada pantalla porque lo usan la grilla de /stock y los dos
 * botones de compartir (la fila de la tabla y el header de la ficha), y ahí el
 * número importa más que en ningún lado: mandarle a una clienta por WhatsApp
 * un precio que la caja no va a cobrar es peor que mostrarlo mal en una tabla
 * interna.
 */
export function textoPrecioProducto(producto: {
  precio?: number | null;
  producto_variantes?: { precio?: number | string | null }[] | null;
}): string {
  const mostrable = precioMostrable(
    producto.precio ?? 0,
    (producto.producto_variantes ?? []).map((v) => v.precio),
  );
  return mostrable.uniforme
    ? formatearMoneda(mostrable.valor)
    : `${formatearMoneda(mostrable.min)} - ${formatearMoneda(mostrable.max)}`;
}
