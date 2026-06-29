import { CartItemStore } from "@/entities/cart/types";
import { CreateSalePaymentInput } from "@/entities/ventas/types";
import { MetodoPago } from "@/entities/payments/types";
import { DescuentoDetalle, PromocionDB } from "./types";

interface PromocionesElegiblesParams {
  promociones: PromocionDB[];
  totalCarrito: number;
  pagos: CreateSalePaymentInput[];
  items: CartItemStore[];
  metodosPago: MetodoPago[];
}

export function getPromocionesElegibles({
  promociones,
  totalCarrito,
  pagos,
  items,
  metodosPago,
}: PromocionesElegiblesParams) {
  return promociones.filter((promo) => {
    if (promo.monto_minimo && totalCarrito < promo.monto_minimo) {
      return false;
    }

    if (promo.tipo_regla === "METODO_PAGO") {
      const metodosPromo =
        promo.promociones_metodos_pago?.map((m) => m.metodo_pago) || [];
      const selectedTipos = pagos.map(
        (p) => metodosPago.find((m) => m.id === p.metodoPagoId)?.tipo,
      );

      if (selectedTipos.length === 0) return false;

      return selectedTipos.every((tipo) => tipo && metodosPromo.includes(tipo));
    }

    if (promo.tipo_regla === "CATEGORIA") {
      const categorias =
        promo.promociones_categorias?.map((c) =>
          c.categoria_nombre.toLowerCase(),
        ) || [];

      return items.some((item) => categorias.includes(item.tipo.toLowerCase()));
    }

    return true;
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
