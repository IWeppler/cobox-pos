/**
 * Qué precio de venta se propone cuando una fila del remito se asocia a un
 * producto que YA existe.
 *
 * EL PROBLEMA (reportado por Evelyn, 8/9/2026). Asociar una fila a un producto
 * existente es, casi siempre, una ACTUALIZACIÓN de ese producto: entra
 * mercadería nueva, con un costo nuevo. Pero la pantalla proponía el precio
 * VIEJO del producto —`precio_venta_actualizado || producto.precio`— así que al
 * aprobar se escribía el costo nuevo y el precio de antes. El margen se comía
 * solo, sin que nadie lo dijera.
 *
 * Y no es un caso de borde: de las 5.866 líneas de remito de Evens, apenas 795
 * traen precio de venta, y en Estilo Bonito son CERO de 3.014. O sea que en el
 * 86% de Evens y en el 100% de Estilo Bonito, "el precio" era el viejo.
 *
 * QUÉ HACE ESTO. Propone un precio y —tan importante como el número— DICE de
 * dónde salió, para que la pantalla lo pueda explicar en una línea. Que el
 * número sea correcto no alcanza si la persona no entiende por qué es ese: la
 * confusión que motivó este módulo fue justamente esa.
 *
 * NO escribe nada. Es una propuesta que queda en el input de la fila y se
 * aprueba a mano, igual que antes.
 */

export type OrigenPrecio =
  /** Recargo global aplicado o precio tipeado a mano en la fila. */
  | "edicion"
  /** El proveedor mandó precio sugerido en la planilla. */
  | "remito"
  /** Costo nuevo × el markup que ese producto ya tenía. */
  | "markup"
  /** Sin markup previo del que agarrarse: se usa el doble del costo. */
  | "doble-costo"
  /** No hay costo nuevo con el que recalcular: queda el precio actual. */
  | "sin-cambio";

export interface PropuestaPrecio {
  precio: number;
  origen: OrigenPrecio;
  /** Frase corta, lista para mostrar debajo del precio. */
  explicacion: string;
  markupAnterior: number | null;
  markupNuevo: number | null;
  /** El costo del remito difiere del que tiene hoy el producto. */
  costoCambio: boolean;
  /**
   * Lo que la pantalla tiene que avisar además del número, o null.
   *
   * Hoy hay un solo caso: las variantes del producto no tienen todas el mismo
   * precio, así que el precio que se aprueba acá va a la cabecera y NO baja a
   * las que tienen el suyo. Es un aviso y no un bloqueo: el ingreso de
   * mercadería tiene que poder cerrarse igual.
   */
  advertencia: string | null;
}

export interface EntradaPrecio {
  /** Costo unitario que trae el remito. */
  costoRemito: number;
  /** Precio de venta sugerido por el proveedor, si la planilla lo trae. */
  precioSugeridoRemito?: number | null;
  /** Lo que ya se calculó para esta fila (recargo global o edición manual). */
  precioEnLaFila?: number | null;
  /**
   * Lo que hoy tiene el producto al que se está asociando, y OJO: tiene que
   * ser el precio EFECTIVO, no el de cabecera.
   *
   * `productos.precio` y `producto_variantes.precio` pueden decir cosas
   * distintas, y en la venta gana la variante. Calcular el markup anterior
   * contra la cabecera, como se hacía hasta el 8/9/2026, "conservaba" un
   * margen sacado de un precio que nadie cobra. La vista
   * `productos_precio_efectivo` resuelve cuál es cuál.
   */
  costoActualProducto?: number | null;
  precioActualProducto?: number | null;
  /**
   * Las variantes no coinciden entre ellas: no hay un precio del producto.
   * Ver `Producto.precios_dispares`. No cambia el número que se propone
   * —seguiría siendo el mejor disponible— pero sí lo que hay que avisar.
   */
  preciosDispares?: boolean;
}

const pesos = (valor: number) => `$${Math.round(valor).toLocaleString("es-AR")}`;

/**
 * El markup del comercio cuando no hay uno propio del que agarrarse.
 *
 * Dos: el 93,1% de los productos de Evens y el 94,4% de los de Estilo Bonito
 * tienen precio exactamente el doble del costo. Es la misma constante que usa
 * la carga inicial, y por el mismo motivo — acá no se está adivinando un
 * precio, se está aplicando la regla que el comercio ya usa.
 */
const MARKUP_POR_DEFECTO = 2;

function markup(precio: number, costo: number): number | null {
  if (!(costo > 0) || !(precio > 0)) return null;
  return precio / costo;
}

export function precioAlAsociar({
  costoRemito,
  precioSugeridoRemito,
  precioEnLaFila,
  costoActualProducto,
  precioActualProducto,
  preciosDispares,
}: EntradaPrecio): PropuestaPrecio {
  const costoNuevo = Number(costoRemito) || 0;
  const costoViejo = Number(costoActualProducto) || 0;
  const precioViejo = Number(precioActualProducto) || 0;
  const markupAnterior = markup(precioViejo, costoViejo);
  const costoCambio = costoNuevo > 0 && costoViejo > 0 && costoNuevo !== costoViejo;

  const advertencia = preciosDispares
    ? "Este producto tiene variantes con precio propio distinto: el precio nuevo va al producto, y esas variantes lo conservan."
    : null;

  const conMarkup = (precio: number, origen: OrigenPrecio, explicacion: string) => ({
    precio,
    origen,
    explicacion,
    markupAnterior,
    markupNuevo: markup(precio, costoNuevo),
    costoCambio,
    advertencia,
  });

  // 1. Lo que la persona ya decidió para esta fila manda sobre todo lo demás.
  const enLaFila = Number(precioEnLaFila) || 0;
  if (enLaFila > 0) {
    return conMarkup(enLaFila, "edicion", "Precio puesto en esta fila.");
  }

  // 2. El precio del proveedor es el dato más fresco que hay.
  const sugerido = Number(precioSugeridoRemito) || 0;
  if (sugerido > 0) {
    return conMarkup(sugerido, "remito", "Precio sugerido en la planilla del proveedor.");
  }

  // 3. Costo nuevo con el markup que este producto ya tenía. Es lo que
  //    respeta la política de precios del comercio sin inventarla: si vendía
  //    al doble, sigue al doble; si tenía un margen distinto, se conserva.
  if (costoNuevo > 0 && markupAnterior !== null) {
    const precio = Math.ceil(costoNuevo * markupAnterior);
    return conMarkup(
      precio,
      "markup",
      costoCambio
        ? `Costo ${pesos(costoViejo)} → ${pesos(costoNuevo)}, manteniendo el margen (×${markupAnterior.toFixed(2)}).`
        : `Mismo costo que antes, mismo margen (×${markupAnterior.toFixed(2)}).`,
    );
  }

  // 4. Producto sin precio o sin costo cargado: no hay margen previo que
  //    conservar, así que se aplica el del comercio.
  if (costoNuevo > 0) {
    const precio = Math.ceil(costoNuevo * MARKUP_POR_DEFECTO);
    return conMarkup(
      precio,
      "doble-costo",
      `El producto no tenía costo cargado: se propone el doble del costo del remito (${pesos(costoNuevo)}).`,
    );
  }

  // 5. El remito no trae costo: no hay con qué recalcular nada.
  return conMarkup(
    precioViejo,
    "sin-cambio",
    "El remito no trae costo: queda el precio actual del producto.",
  );
}
