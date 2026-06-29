import { TicketData } from "@/entities/ventas/types";

export const formatTicketMoney = (value?: number | null) =>
  `$${Number(value || 0).toLocaleString("es-AR")}`;

export const getTicketSubtotal = (ticket: TicketData | null) =>
  ticket?.items.reduce((acc, item) => {
    const precioUnitario = item.precioUnitario || item.precio || 0;
    return acc + precioUnitario * item.cantidad;
  }, 0) || 0;

export const getTicketFinancialSummary = (ticket: TicketData | null) => {
  const montoPendiente = Number(ticket?.montoPendiente || 0);
  const montoCobrado = Number(ticket?.montoCobrado ?? ticket?.total ?? 0);
  const esFiado =
    ticket?.estadoPago === "PARCIAL" ||
    ticket?.estadoPago === "PENDIENTE" ||
    montoPendiente > 0.05;

  return {
    esFiado,
    montoCobrado,
    montoPendiente,
    pagosDesglosados: ticket?.pagosDesglosados ?? [],
  };
};
