/**
 * Qué precio corresponde a un producto según la LISTA con la que se vende.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LISTA ≠ PROMOCIÓN, Y LA DIFERENCIA NO ES DE VOCABULARIO
 *
 * Una promoción responde "¿bajo qué condición modifico el precio?" y una lista
 * responde "¿qué precio corresponde a este tipo de cliente?". Son dos ejes
 * distintos y por eso viven en dos módulos:
 *
 *   este archivo ................ por UNIDAD, permanente, nunca sale a la
 *                                 vidriera, la edita un admin
 *   descuento-promocion.ts ...... por TICKET, temporal, se publica a propósito
 *
 * El orden en que se aplican es fijo: primero la lista decide cuánto vale la
 * unidad, después la promoción descuenta sobre el ticket. Al revés no tiene
 * sentido aritmético ni contable.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * "SIN LISTA" NO ES UNA LISTA
 *
 * No existe una fila "Minorista". `productos.precio` YA es el precio
 * minorista, y `lista === null` significa exactamente el comportamiento de
 * hoy. Es lo que hace que los comercios que no usan listas sigan funcionando
 * igual POR CONSTRUCCIÓN y no porque un seed haya salido bien: sin listas
 * cargadas, esta función devuelve el precio base y nada más puede pasar.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * FAIL-CLOSED EN TODAS LAS RAMAS. Lista inactiva, regla desconocida, markup
 * sin costo cargado o una regla que da cero: en todos los casos se cae al
 * precio BASE, que es un precio que el comercio cargó a mano. Nunca a cero y
 * nunca a un número inventado. El motivo se devuelve para que la pantalla lo
 * pueda decir en vez de mostrar un precio raro sin explicación.
 *
 * NO HACE IO y no sabe de negocios ni de sesiones: recibe los datos ya
 * resueltos, igual que `determinar-comprobante.ts`. Así la matriz entera se
 * testea sin base, que es lo que permite escribirla antes de que las tablas
 * existan.
 */

/**
 * Cómo deriva una lista su precio del producto.
 *
 * `PORCENTAJE`: ajuste sobre el precio BASE. El valor va FIRMADO — `-20` es
 * 20% menos y `+15` es 15% más. Firmado y no "descuento" porque una lista de
 * precios no siempre baja: la lista de contado y la de crédito son la misma
 * cosa mirada desde los dos lados. La pantalla que la crea es la que traduce
 * el signo a palabras.
 *
 * `MARKUP`: multiplicador sobre el COSTO. `1.5` es costo × 1,5. Existe porque
 * estos comercios ya piensan así — el 93,1% de los productos de Evens y el
 * 94,4% de los de Estilo Bonito están a exactamente el doble del costo — y
 * porque una lista mayorista definida sobre el costo no se desactualiza cuando
 * cambia el precio de venta.
 */
export type TipoReglaLista = "PORCENTAJE" | "MARKUP";

/** Lo mínimo que hace falta saber de una lista para resolver un precio. */
export interface ListaDePrecios {
  id?: string;
  nombre?: string;
  tipo_regla: string;
  valor: number;
  activa?: boolean | null;
  /**
   * Si una promoción puede descontar ADEMÁS del precio de lista.
   *
   * Default false en la base, y es la decisión más cara de esta feature: sobre
   * un producto de $20.000 al doble del costo, una lista de −20% más una promo
   * de 5% deja el margen en 34,2% contra el 50% de partida. Puede ser lo que
   * el comercio quiere; lo que no puede es pasar sin que nadie lo haya
   * decidido, que es lo que pasaría si el default fuera true.
   */
  admite_promociones?: boolean | null;
}

export type OrigenPrecio =
  /** Precio fijo cargado para este producto en esta lista. */
  | "override"
  /** La regla de la lista, aplicada al precio base. */
  | "regla"
  /** El precio de siempre: sin lista, o con una lista que no pudo aplicarse. */
  | "base";

/** Por qué se terminó usando el precio base habiendo una lista de por medio. */
export type MotivoBase =
  /** No se eligió ninguna lista. Es el caso normal en 7 de los 8 negocios. */
  | "SIN_LISTA"
  | "LISTA_INACTIVA"
  /** `tipo_regla` que este código no conoce. Fail-closed. */
  | "REGLA_DESCONOCIDA"
  /** MARKUP sobre un producto sin costo cargado. */
  | "SIN_COSTO"
  /** La regla dio cero o menos: es un error de configuración, no un precio. */
  | "REGLA_INVALIDA"
  /** El producto no tiene precio base cargado. No es gratis: está sin cargar. */
  | "SIN_PRECIO_BASE";

export interface PrecioResuelto {
  /** Lo que vale UNA unidad. Multiplicar por cantidad es del llamador. */
  precio: number;
  origen: OrigenPrecio;
  /** Solo cuando `origen` es "base". Null cuando la lista sí se aplicó. */
  motivo: MotivoBase | null;
  /** El precio de siempre, para poder mostrarlo tachado al lado. */
  precioBase: number;
  /** El precio resuelto difiere del base: hay algo que mostrarle a la persona. */
  difiere: boolean;
}

export interface EntradaPrecio {
  /** `variante.precio ?? producto.precio`. Ver `precioBaseDeVariante`. */
  precioBase: number;
  /** `productos.precio_costo`. Solo lo usa la regla MARKUP. */
  precioCosto?: number | null;
  /** La lista con la que se está vendiendo. `null` = precio de siempre. */
  lista?: ListaDePrecios | null;
  /** `producto_precios.precio` para este producto en esta lista, si existe. */
  override?: number | null;
}

const num = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Al peso, y en ESTA etapa.
 *
 * Tiene que ser un paso explícito y compartido: el POS y `create-sale` calculan
 * el mismo precio por caminos distintos, y si uno redondea el unitario y el
 * otro el subtotal, cada venta con lista dispara `[VENTA PRECIO MISMATCH]`.
 * Al peso y no a la decena porque no hay ninguna evidencia de que estos
 * comercios redondeen más grueso; el recargo por método ya redondea igual.
 */
export const redondearAPeso = (valor: number): number => Math.round(valor);

/**
 * El precio de siempre de una variante.
 *
 * Esta cascada está hoy repetida en `pos-terminal.tsx`, `product-detail.tsx` y
 * `create-sale.ts`. Vive acá porque es exactamente el número sobre el que
 * opera una lista, y tener dos definiciones de "el precio base" es la forma de
 * que la lista se aplique sobre uno distinto según la pantalla.
 *
 * OJO CON LOS DATOS: de 5.904 variantes, 4.583 tienen `precio` en null y otras
 * 1.259 lo tienen cargado pero IGUAL al del producto. Solo 62 —el 1,05%— tienen
 * uno propio. O sea que en la práctica el precio es del producto, y por eso el
 * override de lista es a nivel PRODUCTO.
 *
 * Todavía no lo consume nadie: las tres pantallas se cablean en el paso 5.
 */
export function precioBaseDeVariante(
  producto: { precio?: number | null },
  variante?: { precio?: number | null } | null,
): number {
  return variante?.precio != null ? num(variante.precio) : num(producto.precio);
}

function aplicarRegla(
  lista: ListaDePrecios,
  precioBase: number,
  precioCosto: number,
): { precio: number } | { motivo: MotivoBase } {
  switch (lista.tipo_regla as TipoReglaLista) {
    case "PORCENTAJE": {
      const precio = redondearAPeso(precioBase * (1 + num(lista.valor) / 100));
      return precio > 0 ? { precio } : { motivo: "REGLA_INVALIDA" };
    }

    case "MARKUP": {
      // 3.020 de 3.153 variantes de Evens tienen costo cero. Una lista por
      // markup sobre eso daría $0, así que el costo faltante es un caso
      // esperado y no una excepción.
      if (precioCosto <= 0) return { motivo: "SIN_COSTO" };
      const precio = redondearAPeso(precioCosto * num(lista.valor));
      return precio > 0 ? { precio } : { motivo: "REGLA_INVALIDA" };
    }

    default:
      // Fail-closed, mismo criterio que el `default` de `promocionAplica` y que
      // los CHECK de `rubro`, `egresos.tipo` y `modo_facturacion`.
      return { motivo: "REGLA_DESCONOCIDA" };
  }
}

/**
 * El precio de UNA unidad, con la cascada completa.
 *
 *   override del producto en esta lista
 *     → regla de la lista sobre el precio base
 *       → precio base
 *
 * El override NO es un ajuste sobre el resultado de la regla: la REEMPLAZA
 * entera. Si la campera tiene mayorista fijo de $37.000, el −20% no participa.
 * Por eso la cascada es un `??` y no una secuencia de transformaciones — leerla
 * como cadena invita a preguntarse si el override es absoluto o relativo, y esa
 * duda termina en dos implementaciones distintas.
 */
export function precioDeLista({
  precioBase,
  precioCosto,
  lista = null,
  override = null,
}: EntradaPrecio): PrecioResuelto {
  const base = num(precioBase);
  const costo = num(precioCosto);

  const conBase = (motivo: MotivoBase): PrecioResuelto => ({
    precio: base,
    origen: "base",
    motivo,
    precioBase: base,
    difiere: false,
  });

  // Un producto sin precio cargado no vale cero: está sin cargar. Se devuelve
  // el cero para que el llamador lo frene, nunca un precio derivado de él —
  // cualquier regla sobre cero da cero y propagaría el error en silencio.
  if (base <= 0) return conBase("SIN_PRECIO_BASE");

  if (!lista) return conBase("SIN_LISTA");
  if (lista.activa === false) return conBase("LISTA_INACTIVA");

  // El override gana sobre todo lo demás, incluido el precio propio de una
  // variante: es un precio que una persona cargó a mano PARA esta lista.
  const fijo = num(override);
  if (fijo > 0) {
    return {
      precio: redondearAPeso(fijo),
      origen: "override",
      motivo: null,
      precioBase: base,
      difiere: redondearAPeso(fijo) !== base,
    };
  }

  const resultado = aplicarRegla(lista, base, costo);
  if ("motivo" in resultado) return conBase(resultado.motivo);

  return {
    precio: resultado.precio,
    origen: "regla",
    motivo: null,
    precioBase: base,
    difiere: resultado.precio !== base,
  };
}

/**
 * ¿Se puede vender esta línea?
 *
 * Existe como función y no como un `> 0` suelto porque es el freno del caso
 * E3: un producto sin precio base, vendido con lista, terminaría cobrándose
 * $0 sin que nada avise. El POS lo usa para no dejar cargar la línea y el
 * server para rechazarla.
 */
export function esPrecioVendible(resuelto: PrecioResuelto): boolean {
  return resuelto.precio > 0;
}

/**
 * ¿Una promoción puede descontar sobre este precio?
 *
 * Sin lista, siempre: es el comportamiento de hoy y no se toca. Con lista,
 * manda `admite_promociones`, que por defecto es false. Ver el comentario de
 * ese campo para el número que hay detrás de la decisión.
 */
export function admitePromociones(lista?: ListaDePrecios | null): boolean {
  if (!lista) return true;
  return lista.admite_promociones === true;
}
