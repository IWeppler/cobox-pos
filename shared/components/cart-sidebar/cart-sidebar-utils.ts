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

    switch (promo.tipo_regla) {
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

      case "CANAL_PUBLICO":
        return canal === "PUBLICO";

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

  return {
    monto: Math.round(Math.min(descuento, totalCarrito)),
    nombre: promo.nombre,
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
    case "CANAL_PUBLICO":
      return `${valor} exclusivo por el catálogo online`;
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
  promocionesMostradas,
}: {
  numeroWhatsApp?: string;
  nombreComercio?: string | null;
  items: CartItemStore[];
  total: number;
  nombreCliente: string;
  modalidad: ModalidadEntregaPublica;
  direccion?: string;
  localidad?: string;
  costoEnvio?: number;
  nota?: string;
  promocionesMostradas?: PromocionDB[];
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

  mensaje += `\nTOTAL: $${total.toLocaleString("es-AR")}\n`;

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

  if (promocionesMostradas && promocionesMostradas.length > 0) {
    mensaje += `\n\nPromociones que vi disponibles:`;
    promocionesMostradas.forEach((promo) => {
      mensaje += `\n- ${formatearPromoPublica(promo)}`;
    });
  }

  mensaje += `\n\nTienen stock disponible para confirmar?`;

  return `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
}
