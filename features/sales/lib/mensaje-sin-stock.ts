/**
 * El mensaje que ve la vendedora cuando un renglón no tiene mercadería.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ALCANZA CON EL NOMBRE DE LA VARIANTE
 *
 * Decía: «Sin stock suficiente para la variante "40"».
 *
 * En indumentaria el `nombre_display` de una variante es el talle y el color,
 * y en muchos catálogos es SOLO el talle. O sea que el mensaje decía «40» y
 * nada más: con un ticket de tres renglones, la vendedora tiene que adivinar
 * cuál de los tres es, con la clienta esperando. Y "40" puede ser un talle de
 * campera, de zapatilla o de pantalón en el mismo ticket.
 *
 * El nombre del producto es el dato que permite ir al perchero. Sale de la
 * MISMA fila que ya se estaba trayendo para el precio, así que no cuesta una
 * consulta.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Es pura y sin IO —recibe los renglones ya resueltos— por el mismo motivo que
 * el resto de este módulo: el texto que ve alguien en el mostrador se puede
 * probar sin levantar una venta.
 */

export interface RenglonSinStock {
  /** `productos.nombre`, de la base. Puede faltar en un carrito viejo. */
  producto?: string | null;
  /** `producto_variantes.nombre_display`: el talle, el color, o los dos. */
  variante?: string | null;
}

const limpiar = (valor?: string | null) => (valor ?? "").trim();

/**
 * Cómo se nombra UN renglón.
 *
 * La variante va entre paréntesis y solo si agrega algo: hay productos sin
 * variantes reales donde el `nombre_display` repite el nombre del producto, y
 * «Campera Corderito (Campera Corderito)» se lee como un error del sistema.
 */
export function describirRenglon(renglon: RenglonSinStock): string {
  const producto = limpiar(renglon.producto);
  const variante = limpiar(renglon.variante);

  if (!producto) return variante ? `"${variante}"` : "";
  if (!variante || variante.toLowerCase() === producto.toLowerCase()) {
    return `"${producto}"`;
  }
  return `"${producto}" (${variante})`;
}

/**
 * El texto completo del error.
 *
 * Sin ningún renglón identificable cae al mensaje genérico de siempre: es
 * preferible decir poco a nombrar mal el producto que la vendedora tiene que
 * ir a buscar.
 */
export function mensajeSinStock(faltantes: RenglonSinStock[]): string {
  const descriptos = faltantes.map(describirRenglon).filter(Boolean);

  if (descriptos.length === 0) {
    return "Sin stock suficiente para completar la venta.";
  }
  if (descriptos.length === 1) {
    return `Sin stock de ${descriptos[0]}.`;
  }

  // "a, b y c": es como se enumera en castellano, y son renglones que la
  // persona va a leer en voz alta mientras revisa el perchero.
  const ultimo = descriptos[descriptos.length - 1];
  const previos = descriptos.slice(0, -1).join(", ");
  return `Sin stock de ${previos} y ${ultimo}.`;
}
