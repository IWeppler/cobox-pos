import { TicketData } from "@/entities/ventas/types";

export const formatTicketMoney = (value?: number | null) =>
  `$${Number(value || 0).toLocaleString("es-AR")}`;

export const getTicketSubtotal = (ticket: TicketData | null) =>
  ticket?.items.reduce((acc, item) => {
    const precioUnitario = item.precioUnitario || item.precio || 0;
    return acc + precioUnitario * item.cantidad;
  }, 0) || 0;

export const getTicketFinancialSummary = (ticket: TicketData | null) => {
  const pagosDesglosados = ticket?.pagosDesglosados ?? [];

  if (!ticket) {
    return {
      esFiado: false,
      montoCobrado: 0,
      montoPendiente: 0,
      pagosDesglosados,
    };
  }

  const hasExplicitFinancialSummary =
    ticket.esFiadoDirecto !== undefined ||
    ticket.montoCobrado !== undefined ||
    ticket.montoPendiente !== undefined;

  if (hasExplicitFinancialSummary) {
    const montoPendiente = Number(ticket.montoPendiente ?? 0);
    const montoCobrado = Number(
      ticket.montoCobrado ?? Math.max(0, ticket.total - montoPendiente),
    );
    const esFiado =
      Boolean(ticket.esFiadoDirecto) ||
      ticket.estadoPago === "PARCIAL" ||
      ticket.estadoPago === "PENDIENTE" ||
      montoPendiente > 0.05;

    return {
      esFiado,
      montoCobrado,
      montoPendiente,
      pagosDesglosados,
    };
  }

  const montoPendiente = 0;
  const montoCobrado = Number(ticket.total ?? 0);
  const esFiado =
    ticket.estadoPago === "PARCIAL" || ticket.estadoPago === "PENDIENTE";

  return {
    esFiado,
    montoCobrado,
    montoPendiente,
    pagosDesglosados,
  };
};
