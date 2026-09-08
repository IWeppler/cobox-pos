/**
 * Cuánto descuenta una promoción sobre una venta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE MÓDULO (8/9/2026)
 *
 * El descuento era la ÚNICA palanca de plata que NO se recalculaba en el
 * server. `create-sale.ts` leía `descuento_monto` del FormData y lo usaba tal
 * cual: cargaba la promoción solo para saber su nombre y su `tipo_regla`, no
 * chequeaba que estuviera activa, ni las fechas, ni el límite de usos, ni que
 * el monto se pareciera al que esa promoción permite. El único freno era
 * `Math.max(0, total - descuento)`, que evita un total negativo y nada más.
 *
 * Las otras tres palancas ya estaban blindadas y con el mismo patrón: el
 * precio de cada renglón (`precioServer`), el recargo por método
 * (`calcularPagosConRecargo`) y el recargo de cuenta corriente
 * (`cc_recargo_default`). Todas se recalculan desde la base, y lo que manda el
 * cliente solo se compara y se loguea.
 *
 * Esto cierra esa asimetría, y la cierra con una función COMPARTIDA en vez de
 * una copia en el server: dos funciones que contestan "¿cuánto se descuenta?"
 * con distinta información terminan en dos respuestas distintas, y acá la
 * diferencia es plata que sale del cajón. Mismo criterio que
 * `recargo-metodo.ts`, `unidad-venta.ts` y `determinar-comprobante.ts`.
 *
 * La usan los dos lados:
 *   - el POS y el carrito público, para mostrar el desglose
 *   - `create-sale.ts`, para decidir cuánto se descuenta de verdad
 * ─────────────────────────────────────────────────────────────────────────
 *
 * NO decide si una promo es elegible para el CANAL (`mostrar_en_catalogo`) ni
 * cuál se elige entre varias cuando compiten: eso es propio de cada superficie
 * y sigue viviendo en `cart-sidebar-utils.ts`. Acá está solo lo que tiene que
 * dar igual en los dos lados.
 */

/** Lo mínimo que hace falta saber de una promoción para calcular su descuento. */
export interface PromocionCalculable {
  tipo_regla: string | null;
  tipo_descuento: string;
  valor_descuento: number;
  monto_minimo?: number | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  limite_usos?: number | null;
  usos_actuales?: number | null;
  activa?: boolean | null;
}

/**
 * Un renglón, en la forma mínima que comparten el carrito del cliente
 * (`CartItemStore`) y los items ya resueltos del server. `precio` es por
 * UNIDAD en las dos puntas.
 */
export interface LineaDescontable {
  /** `productos.tipo`: contra esto matchean las promos por categoría. */
  tipo?: string | null;
  precio: number;
  cantidad: number;
}

const num = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

export function totalDeLineas(lineas: LineaDescontable[]): number {
  return lineas.reduce(
    (acc, linea) => acc + num(linea.precio) * num(linea.cantidad),
    0,
  );
}

const enCategorias = (linea: LineaDescontable, categorias: string[]): boolean =>
  categorias.includes((linea.tipo ?? "").toLowerCase());

/**
 * Sobre qué monto se calcula el descuento.
 *
 * Con `tipo_regla = CATEGORIA` es el subtotal de los renglones de esas
 * categorías; en todo el resto, el total del ticket. Las categorías llegan ya
 * en minúscula porque cada lado las lee de un lugar distinto —el cliente del
 * embed de la promo, el server de su propia consulta— y normalizarlas dos
 * veces es la forma de que un día no coincidan.
 */
export function baseDescontable(
  promo: PromocionCalculable,
  lineas: LineaDescontable[],
  categorias: string[],
): number {
  if (promo.tipo_regla !== "CATEGORIA") return totalDeLineas(lineas);
  return totalDeLineas(lineas.filter((l) => enCategorias(l, categorias)));
}

/**
 * ¿La promoción está viva HOY?
 *
 * Es lo que el cliente ya chequeaba en `getPromocionesElegibles` y el server no
 * chequeaba en ningún lado. `activa` es el caso que más importa: apagar una
 * promoción no impedía seguir usándola desde un POS que la tenía cargada de
 * antes, ni desde un request armado a mano.
 */
export function promocionVigente(
  promo: PromocionCalculable,
  ahora: Date = new Date(),
): boolean {
  if (promo.activa === false) return false;
  if (promo.fecha_inicio && new Date(promo.fecha_inicio) > ahora) return false;
  if (promo.fecha_fin && new Date(promo.fecha_fin) < ahora) return false;
  if (
    promo.limite_usos != null &&
    (promo.usos_actuales ?? 0) >= promo.limite_usos
  ) {
    return false;
  }
  return true;
}

/**
 * Los `tipo_regla` que este código sabe evaluar. Existe para que la superficie
 * que quiera avisar de una regla desconocida pueda distinguirla de una que
 * simplemente no se cumple: las dos hacen que `promocionAplica` devuelva
 * false, pero solo una es un bug de datos.
 */
export const TIPOS_REGLA_CONOCIDOS: ReadonlySet<string | null> = new Set([
  null,
  "MONTO_MINIMO",
  "METODO_PAGO",
  "CATEGORIA",
]);

export interface ContextoDescuento {
  promo: PromocionCalculable;
  lineas: LineaDescontable[];
  /** Categorías alcanzadas por la promo, en minúscula. */
  categorias?: string[];
  /**
   * Tipos de método de pago del ticket (EFECTIVO, TARJETA, …). Con
   * `tipo_regla = METODO_PAGO` la promo exige que TODOS los cobros sean de un
   * método incluido: un descuento por pagar en efectivo no se gana pagando la
   * mitad en efectivo.
   */
  tiposDePago?: (string | null | undefined)[];
  /** Métodos que la promo acepta, tal como los guarda `promociones_metodos_pago`. */
  metodosDeLaPromo?: string[];
}

/**
 * ¿Se cumple la condición de la promoción para ESTA venta?
 *
 * Fail-closed en el `default`: un `tipo_regla` que este código no conoce NO
 * descuenta. Es la regla que ya tenía `getPromocionesElegibles` y el mismo
 * criterio que los CHECK de `rubro`, `egresos.tipo` y `modo_facturacion`.
 */
export function promocionAplica({
  promo,
  lineas,
  categorias = [],
  tiposDePago = [],
  metodosDeLaPromo = [],
}: ContextoDescuento): boolean {
  const total = totalDeLineas(lineas);

  // El monto mínimo es general a todo `tipo_regla`, no solo a MONTO_MINIMO.
  if (promo.monto_minimo && total < num(promo.monto_minimo)) return false;

  switch (promo.tipo_regla) {
    case null:
      return true;

    case "MONTO_MINIMO":
      return true; // ya validado arriba

    case "METODO_PAGO": {
      if (tiposDePago.length === 0) return false;
      return tiposDePago.every(
        (tipo) => !!tipo && metodosDeLaPromo.includes(tipo),
      );
    }

    case "CATEGORIA":
      return lineas.some((l) => enCategorias(l, categorias));

    default:
      return false;
  }
}

/**
 * Cuánto descuenta, en pesos.
 *
 * Redondeado al peso y topeado por la BASE, no por el total del ticket: un
 * MONTO_FIJO de $50.000 sobre una categoría cuyo subtotal es $10.000 no puede
 * descontar el resto del ticket. En toda promo que no es por categoría la base
 * ES el total, así que el tope es exactamente el de siempre.
 *
 * Devuelve 0 —nunca negativo, nunca NaN— ante cualquier valor que no se
 * entienda: lo que no se entiende no descuenta.
 */
export function calcularDescuentoPromocion(ctx: ContextoDescuento): number {
  const { promo, lineas, categorias = [] } = ctx;

  const base = baseDescontable(promo, lineas, categorias);
  if (base <= 0) return 0;

  const bruto =
    promo.tipo_descuento === "PORCENTAJE"
      ? (base * num(promo.valor_descuento)) / 100
      : num(promo.valor_descuento);

  if (bruto <= 0) return 0;

  return Math.round(Math.min(bruto, base));
}

/** Por qué una promoción no descontó nada. Se loguea; no se le muestra al cliente. */
export type MotivoSinDescuento = "VIGENCIA" | "CONDICION" | "MONTO";

/**
 * Vigencia + condición + monto en una sola llamada. Es lo que usa el server, y
 * devuelve el MOTIVO cuando da cero para poder dejarlo en el log en vez de
 * tener que deducirlo después de que la venta ya se registró.
 */
export function resolverDescuento(
  ctx: ContextoDescuento,
  ahora: Date = new Date(),
): { monto: number; motivo: MotivoSinDescuento | null } {
  if (!promocionVigente(ctx.promo, ahora)) {
    return { monto: 0, motivo: "VIGENCIA" };
  }
  if (!promocionAplica(ctx)) {
    return { monto: 0, motivo: "CONDICION" };
  }
  const monto = calcularDescuentoPromocion(ctx);
  return { monto, motivo: monto > 0 ? null : "MONTO" };
}
