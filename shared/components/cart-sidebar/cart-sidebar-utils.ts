import { CartItemStore } from "@/entities/cart/types";
import { CreateSalePaymentInput } from "@/entities/ventas/types";
import { MetodoPago } from "@/entities/payments/types";
import { DescuentoDetalle, PromocionDB } from "./types";

export type CanalVenta = "PUBLICO" | "POS";

interface PromocionesElegiblesParams {
  promociones: PromocionDB[];
  totalCarrito: number;
  pagos: CreateSalePaymentInput[];
  items: CartItemStore[];
  metodosPago: MetodoPago[];
  /** Default "POS": preserva el comportamiento histórico para el admin. */
  canal?: CanalVenta;
}

export function getPromocionesElegibles({
  promociones,
  totalCarrito,
  pagos,
  items,
  metodosPago,
  canal = "POS",
}: PromocionesElegiblesParams) {
  const ahora = new Date();

  return promociones.filter((promo) => {
    if (promo.fecha_inicio && new Date(promo.fecha_inicio) > ahora) {
      return false;
    }
    if (promo.fecha_fin && new Date(promo.fecha_fin) < ahora) {
      return false;
    }

    if (
      promo.limite_usos != null &&
      (promo.usos_actuales ?? 0) >= promo.limite_usos
    ) {
      return false;
    }

    if (promo.monto_minimo && totalCarrito < promo.monto_minimo) {
      return false;
    }

    if (canal === "PUBLICO" && !promo.mostrar_en_catalogo) {
      return false;
    }

    switch (promo.tipo_regla) {
      case null:
        // Sin condición específica: aplica siempre (incluye "mostrar en
        // catálogo" ya validado arriba para el canal público).
        return true;

      case "METODO_PAGO": {
        // En el carrito público todavía no se eligió medio de pago (eso se
        // define después por WhatsApp) — se muestra como informativo sin
        // exigir una selección que no existe en ese flujo.
        if (canal === "PUBLICO") return true;

        const metodosPromo =
          promo.promociones_metodos_pago?.map((m) => m.metodo_pago) || [];
        const selectedTipos = pagos.map(
          (p) => metodosPago.find((m) => m.id === p.metodoPagoId)?.tipo,
        );

        if (selectedTipos.length === 0) return false;

        return selectedTipos.every(
          (tipo) => tipo && metodosPromo.includes(tipo),
        );
      }

      case "CATEGORIA": {
        const categorias =
          promo.promociones_categorias?.map((c) =>
            c.categoria_nombre.toLowerCase(),
          ) || [];

        return items.some((item) =>
          categorias.includes(item.tipo.toLowerCase()),
        );
      }

      case "MONTO_MINIMO":
        // Ya validado arriba (chequeo de monto_minimo es general a todo tipo_regla).
        return true;

      default:
        console.warn(
          `[promociones] tipo_regla desconocido: "${promo.tipo_regla}" en la promoción "${promo.nombre}" (id: ${promo.id}) — se descarta por seguridad.`,
        );
        return false;
    }
  });
}

export function getPromocionActivaId(
  promocionId: string,
  promocionesElegibles: PromocionDB[],
) {
  if (promocionId === "ninguna") return "ninguna";

  return promocionesElegibles.some((promo) => promo.id === promocionId)
    ? promocionId
    : "ninguna";
}

function calcularDescuentoPromo(
  promo: PromocionDB,
  totalCarrito: number,
  items: CartItemStore[],
): number {
  let montoBase = totalCarrito;

  if (promo.tipo_regla === "CATEGORIA") {
    const categorias =
      promo.promociones_categorias?.map((c) =>
        c.categoria_nombre.toLowerCase(),
      ) || [];

    montoBase = items.reduce((acc, item) => {
      if (categorias.includes(item.tipo.toLowerCase())) {
        return acc + item.precio * item.cantidad;
      }
      return acc;
    }, 0);
  }

  const descuento =
    promo.tipo_descuento === "PORCENTAJE"
      ? (montoBase * promo.valor_descuento) / 100
      : promo.valor_descuento;

  return Math.round(Math.min(descuento, totalCarrito));
}

export function getDescuentoDetalle({
  promocionActivaId,
  promocionesElegibles,
  totalCarrito,
  items,
}: {
  promocionActivaId: string;
  promocionesElegibles: PromocionDB[];
  totalCarrito: number;
  items: CartItemStore[];
}): DescuentoDetalle {
  if (promocionActivaId === "ninguna") return { monto: 0, nombre: "" };

  const promo = promocionesElegibles.find(
    (item) => item.id === promocionActivaId,
  );
  if (!promo) return { monto: 0, nombre: "" };

  return {
    monto: calcularDescuentoPromo(promo, totalCarrito, items),
    nombre: promo.nombre,
  };
}

export interface DescuentoCarritoPublico {
  /** Promos que ya restan del total mostrado: todo menos METODO_PAGO. */
  calculablesAplicadas: PromocionDB[];
  /** METODO_PAGO: depende de un dato que este checkout no tiene (cómo paga), queda como aviso aparte. */
  informativasCondicionales: PromocionDB[];
  totalDescuento: number;
  totalConDescuento: number;
}

/**
 * Entre las calculables, "acumulable" decide si se suman todas (true) o si
 * compiten por una sola (false: gana la de mayor descuento en pesos;
 * empate exacto lo resuelve "prioridad", mayor gana).
 */
export function calcularDescuentoCarritoPublico({
  promocionesElegibles,
  totalCarrito,
  items,
}: {
  promocionesElegibles: PromocionDB[];
  totalCarrito: number;
  items: CartItemStore[];
}): DescuentoCarritoPublico {
  const calculables = promocionesElegibles.filter(
    (p) => p.tipo_regla !== "METODO_PAGO",
  );
  const informativasCondicionales = promocionesElegibles.filter(
    (p) => p.tipo_regla === "METODO_PAGO",
  );

  const acumulables = calculables.filter((p) => p.acumulable);
  const exclusivas = calculables.filter((p) => !p.acumulable);

  const descuentoAcumulables = acumulables.map((promo) => ({
    promo,
    descuento: calcularDescuentoPromo(promo, totalCarrito, items),
  }));

  let mejorExclusiva: { promo: PromocionDB; descuento: number } | null = null;
  for (const promo of exclusivas) {
    const descuento = calcularDescuentoPromo(promo, totalCarrito, items);
    if (
      !mejorExclusiva ||
      descuento > mejorExclusiva.descuento ||
      (descuento === mejorExclusiva.descuento &&
        (promo.prioridad ?? 0) > (mejorExclusiva.promo.prioridad ?? 0))
    ) {
      mejorExclusiva = { promo, descuento };
    }
  }

  const calculablesAplicadas = [
    ...descuentoAcumulables.map((d) => d.promo),
    ...(mejorExclusiva ? [mejorExclusiva.promo] : []),
  ];

  const totalDescuento = Math.min(
    totalCarrito,
    descuentoAcumulables.reduce((acc, d) => acc + d.descuento, 0) +
      (mejorExclusiva?.descuento ?? 0),
  );

  return {
    calculablesAplicadas,
    informativasCondicionales,
    totalDescuento,
    totalConDescuento: totalCarrito - totalDescuento,
  };
}

const METODO_PAGO_LABEL: Record<string, string> = {
  EFECTIVO: "efectivo",
  TRANSFERENCIA: "transferencia",
  TARJETA: "tarjeta",
};

/**
 * Texto informativo para mostrar una promo en el carrito público (sin
 * aplicarla, solo como aviso). No usado por el admin/POS.
 */
export function formatearPromoPublica(promo: PromocionDB): string {
  const valor =
    promo.tipo_descuento === "PORCENTAJE"
      ? `${promo.valor_descuento}% OFF`
      : `$${promo.valor_descuento.toLocaleString("es-AR")} OFF`;

  switch (promo.tipo_regla) {
    case "METODO_PAGO": {
      const metodo = promo.promociones_metodos_pago?.[0]?.metodo_pago;
      const metodoLabel = metodo ? METODO_PAGO_LABEL[metodo] || metodo : "";
      return `${valor} pagando en ${metodoLabel}`;
    }
    case "CATEGORIA": {
      const categoria = promo.promociones_categorias?.[0]?.categoria_nombre;
      return `${valor} en ${categoria}`;
    }
    case "MONTO_MINIMO":
      return `${valor} a partir de $${promo.monto_minimo.toLocaleString("es-AR")}`;
    default:
      return `${valor}`;
  }
}

export function generarLinkWhatsApp({
  numeroWhatsApp,
  nombreComercio,
  items,
  total,
}: {
  numeroWhatsApp?: string;
  nombreComercio?: string | null;
  items: CartItemStore[];
  total: number;
}) {
  if (!numeroWhatsApp) return "#";

  const nombre = nombreComercio?.trim() || "el negocio";
  let mensaje = `Hola ${nombre}!\nQuiero realizar el siguiente pedido:\n\n`;

  items.forEach((item) => {
    mensaje += `${item.cantidad}x ${item.nombre} (${item.tipo})\n`;
    mensaje += ` - Talle: ${item.variante} - $${(
      item.precio * item.cantidad
    ).toLocaleString("es-AR")}\n`;
  });

  mensaje += `\nTOTAL: $${total.toLocaleString(
    "es-AR",
  )}\n\nTienen stock disponible para confirmar?`;

  return `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
}

export type ModalidadEntregaPublica = "RETIRO" | "ENVIO";

export function generarLinkWhatsAppPublico({
  numeroWhatsApp,
  nombreComercio,
  items,
  total,
  nombreCliente,
  modalidad,
  direccion,
  localidad,
  costoEnvio,
  nota,
  promocionesAplicadas,
  promocionesCondicionales,
  metodosConRecargo,
}: {
  numeroWhatsApp?: string;
  nombreComercio?: string | null;
  items: CartItemStore[];
  /** Ya con el descuento de las promos calculables restado. */
  total: number;
  nombreCliente: string;
  modalidad: ModalidadEntregaPublica;
  direccion?: string;
  localidad?: string;
  costoEnvio?: number;
  nota?: string;
  /** Ya restadas del total de arriba. */
  promocionesAplicadas?: PromocionDB[];
  /** Dependen del método de pago: aviso aparte, no afectan el total. */
  promocionesCondicionales?: PromocionDB[];
  /** Métodos que cobran recargo. Informativo: el total de arriba NO lo
   * incluye porque todavía no se sabe con qué va a pagar. */
  metodosConRecargo?: { nombre: string; recargo_porcentaje: number }[];
}) {
  if (!numeroWhatsApp) return "#";

  const nombre = nombreComercio?.trim() || "el negocio";
  let mensaje = `Hola ${nombre}!\nQuiero realizar el siguiente pedido:\n\n`;

  items.forEach((item) => {
    mensaje += `${item.cantidad}x ${item.nombre} (${item.tipo})\n`;
    mensaje += ` - Talle: ${item.variante} - $${(
      item.precio * item.cantidad
    ).toLocaleString("es-AR")}\n`;
  });

  mensaje += `\nTOTAL (con descuento aplicado): $${total.toLocaleString("es-AR")}\n`;

  mensaje += `\nNombre: ${nombreCliente}`;
  if (modalidad === "ENVIO") {
    mensaje += `\nModalidad: Envío a domicilio`;
    mensaje += `\nLocalidad: ${localidad}`;
    mensaje += `\nDirección: ${direccion}`;
    if (costoEnvio && costoEnvio > 0) {
      mensaje += `\nCosto de envío: $${costoEnvio.toLocaleString("es-AR")}`;
    }
  } else {
    mensaje += `\nModalidad: Retiro en local`;
  }

  if (nota?.trim()) {
    mensaje += `\nNota: ${nota.trim()}`;
  }

  if (promocionesAplicadas && promocionesAplicadas.length > 0) {
    mensaje += `\n\nDescuentos aplicados:`;
    promocionesAplicadas.forEach((promo) => {
      mensaje += `\n- ${formatearPromoPublica(promo)}`;
    });
  }

  if (promocionesCondicionales && promocionesCondicionales.length > 0) {
    mensaje += `\n\nPromos según método de pago (a confirmar):`;
    promocionesCondicionales.forEach((promo) => {
      mensaje += `\n- ${formatearPromoPublica(promo)}`;
    });
  }

  if (metodosConRecargo && metodosConRecargo.length > 0) {
    mensaje += `\n\nRecargos según método de pago (no incluidos en el total):`;
    metodosConRecargo.forEach((metodo) => {
      mensaje += `\n- ${metodo.nombre}: +${metodo.recargo_porcentaje}%`;
    });
  }

  mensaje += `\n\nTienen stock disponible para confirmar?`;

  return `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
}
