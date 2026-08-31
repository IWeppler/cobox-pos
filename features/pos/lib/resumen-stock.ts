import type { Producto, ProductoVariante } from "@/entities/productos/types";

/**
 * El stock del producto, listo para mostrarse en la grilla del POS.
 *
 * PARA QUÉ. En el mostrador la pregunta que aparece antes que ninguna otra es
 * "¿queda?". Hasta acá la grilla solo respondía el caso extremo —la banda
 * "Agotado" cuando el total daba cero— así que para saber si quedaba UNO había
 * que abrir el producto. Con el número a la vista, la vendedora decide sin
 * salir de la grilla.
 *
 * POR QUÉ EL DESGLOSE, y por qué corto. Con variantes el total miente por
 * omisión: "quedan 6" puede ser seis talles distintos o seis del mismo. Por
 * eso se muestran también las primeras variantes con stock. Se corta en tres
 * porque es información SECUNDARIA: una card con nueve talles listados deja de
 * ser una card y pasa a ser una tabla, y lo que se estaba mirando —el nombre y
 * el precio— se pierde. Lo que no entra se cuenta ("+4").
 */

/** Cuántas variantes se nombran antes de resumir el resto en "+N". */
export const MAX_VARIANTES_VISIBLES = 3;

export type ResumenStock = {
  total: number;
  /** Las primeras variantes CON stock, ya etiquetadas para mostrar. */
  variantes: { etiqueta: string; stock: number }[];
  /** Cuántas variantes con stock quedaron sin nombrar. */
  restantes: number;
  /** El producto se maneja por variantes. Un producto sin variantes reales no
   * tiene desglose que mostrar, aunque la base le haya creado la fila "Único". */
  tieneVariantes: boolean;
};

/**
 * El stock que le queda a una variante.
 *
 * `stock_disponible` es el stock físico NETO de reservas activas y solo lo
 * calculan algunas consultas; cuando no viene, el crudo es lo mejor que hay.
 * Mismo criterio que `getStockTotal` en el POS: si acá se leyera otra cosa, el
 * total del encabezado y el desglose de abajo dirían números distintos sobre
 * la misma card.
 */
function stockDe(variante: Pick<ProductoVariante, "stock" | "stock_disponible">) {
  return Number(variante.stock_disponible ?? variante.stock ?? 0);
}

/**
 * Una etiqueta corta para la variante.
 *
 * `nombre_display` suele ser "TALLE: 4 / COLOR: rosa": entero no entra en una
 * card y, peor, la parte que distingue queda cortada por el ellipsis. Se usa
 * el PRIMER atributo, que es el que ordena la elección en el mostrador (el
 * talle antes que el color), y se le saca la etiqueta si viene pegada.
 */
export function etiquetaCortaDeVariante(
  variante: Pick<ProductoVariante, "nombre_display" | "atributos">,
): string {
  const primerAtributo = Object.values(variante.atributos ?? {})[0];
  if (primerAtributo?.trim()) return primerAtributo.trim();

  const primerSegmento = (variante.nombre_display ?? "").split(" / ")[0] ?? "";
  // "TALLE: 4" -> "4". Si no hay etiqueta, queda igual.
  const sinEtiqueta = primerSegmento.includes(":")
    ? primerSegmento.slice(primerSegmento.indexOf(":") + 1)
    : primerSegmento;

  return sinEtiqueta.trim() || primerSegmento.trim();
}

export function resumirStock(producto: Producto): ResumenStock {
  const variantes = producto.producto_variantes ?? [];

  if (variantes.length === 0) {
    // Producto legacy: su stock vive en el espejo `productos_stock`.
    const total =
      producto.stock?.reduce((acc, s) => acc + Number(s.cantidad || 0), 0) || 0;
    return { total, variantes: [], restantes: 0, tieneVariantes: false };
  }

  const total = variantes.reduce((acc, v) => acc + stockDe(v), 0);

  // Un producto sin variantes reales trae una sola fila, "Único", que no es
  // una opción entre otras: mostrarla sería repetir el total con otro nombre.
  const esVarianteUnica =
    variantes.length === 1 &&
    Object.keys(variantes[0].atributos ?? {}).length === 0;

  if (esVarianteUnica) {
    return { total, variantes: [], restantes: 0, tieneVariantes: false };
  }

  // Se AGRUPA por etiqueta antes de mostrar. La etiqueta es el primer
  // atributo, así que dos variantes distintas pueden compartirla: el color
  // "Estampado" en talle 1 y en talle 2 son dos filas con la misma palabra.
  // Sin agrupar, la card mostraba dos veces lo mismo con números distintos
  // ("Estampado 3" y "Estampado 2"), que no le dice nada a nadie en el
  // mostrador, y además repetía la `key` de React — 54 errores en consola
  // en el catálogo de Evens.
  const porEtiqueta = new Map<string, number>();
  for (const v of variantes) {
    const stock = stockDe(v);
    if (stock <= 0) continue;
    const etiqueta = etiquetaCortaDeVariante(v);
    porEtiqueta.set(etiqueta, (porEtiqueta.get(etiqueta) ?? 0) + stock);
  }

  const conStock = [...porEtiqueta.entries()]
    .map(([etiqueta, stock]) => ({ etiqueta, stock }))
    .sort((a, b) => b.stock - a.stock);

  return {
    total,
    variantes: conStock.slice(0, MAX_VARIANTES_VISIBLES),
    restantes: Math.max(0, conStock.length - MAX_VARIANTES_VISIBLES),
    tieneVariantes: true,
  };
}
