"use client";

import { useState, useMemo, useEffect } from "react";
import {
  TicketData,
  TicketItemData,
  Venta,
  VentaItem,
  getSupabaseRelation,
} from "@/entities/ventas/types";
import { Producto } from "@/entities/productos/types";
import { ConfiguracionPOS } from "@/entities/config/types";
import { createClient } from "@/shared/config/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { ChevronLeft, ChevronRight, Eye, Receipt } from "lucide-react";
import { AnularVentaModal } from "./cancel-sale-modal";
import { Button } from "@/shared/ui/button";
import { TicketSheet } from "./ticket-sheet";
import { formatearFechaHora, formatearMoneda } from "@/shared/utils/formatters";
import { getMetodoPagoColor } from "@/shared/utils/payment-methods";
import { SaleTableHeader } from "./sale-table-header";

const ITEMS_POR_PAGINA = 10;

interface VentasTableProps {
  ventas: Venta[];
  productos: Producto[];
  userRole: string;
  puedeAnular: boolean;
}

export function VentasTable({
  ventas = [],
  userRole,
  puedeAnular,
}: Readonly<VentasTableProps>) {
  const [filtroNombre, setFiltroNombre] = useState("");
  const [orden, setOrden] = useState("recientes");
  const [paginaActual, setPaginaActual] = useState(1);

  const [ticketAbierto, setTicketAbierto] = useState<TicketData | null>(null);
  const [branding, setBranding] = useState<ConfiguracionPOS | null>(null);

  const isAdmin = userRole === "ADMIN";

  useEffect(() => {
    const fetchConfig = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("configuracion_pos")
        .select("*")
        .single();

      if (data) {
        setBranding(data as ConfiguracionPOS);
      }
    };

    fetchConfig();
  }, []);

  const ordenOptions = [
    { value: "recientes", label: "Más recientes" },
    { value: "antiguos", label: "Más antiguos" },
    { value: "mayor_total", label: "Mayor ingreso" },
    ...(isAdmin
      ? [{ value: "mayor_ganancia", label: "Mayor ganancia neta" }]
      : []),
    { value: "menor_total", label: "Menor ingreso" },
    { value: "mayor_cantidad", label: "Más unidades vendidas" },
  ];

  const getClienteNombre = (venta: Venta) =>
    getSupabaseRelation(venta.clientes)?.nombre || "Consumidor final";

  const getEstadoPago = (venta: Venta) => {
    if (
      venta.estado_operacion === "ANULADA" ||
      venta.estado_pago === "ANULADA"
    ) {
      return {
        estaPagado: false,
        label: "Anulada",
        variant: "anulada",
      };
    }

    const montoPendiente = Number(venta.monto_pendiente || 0);
    const estaPagado =
      venta.estado_pago === "PAGADA" ||
      (!venta.estado_pago && montoPendiente <= 0) ||
      montoPendiente <= 0;

    return {
      estaPagado,
      label: estaPagado ? "Pagado" : "Fiado",
      variant: estaPagado ? "pagada" : "fiado",
    };
  };

  const getPagoLabel = (venta: Venta) => {
    const pagos = venta.venta_pagos || [];
    if (venta.es_pago_mixto || pagos.length > 1) return "Mixto";
    return pagos[0]?.metodo_nombre || venta.metodo_pago || "EFECTIVO";
  };

  const ventasFiltradasYOrdenadas = useMemo(() => {
    const resultado = ventas.filter((venta) => {
      const items = venta.ventas_items || [];
      if (items.length === 0) return false;

      const searchLower = filtroNombre.toLowerCase().replace("#", "");
      const numeroRecibo = venta.id.split("-")[0].toLowerCase();
      const matchRecibo = numeroRecibo.includes(searchLower);
      const matchCliente = getClienteNombre(venta)
        .toLowerCase()
        .includes(searchLower);

      const matchesFiltros = items.some((item: VentaItem) => {
        const producto = getSupabaseRelation(item.producto);
        const nombre = producto?.nombre?.toLowerCase() || "";
        return nombre.includes(searchLower) || matchRecibo || matchCliente;
      });

      return matchesFiltros;
    });

    resultado.sort((a, b) => {
      const gananciaA = a.total - (a.precio_costo || 0);
      const gananciaB = b.total - (b.precio_costo || 0);

      const cantA = (a.ventas_items || []).reduce(
        (acc: number, item: VentaItem) => acc + item.cantidad,
        0,
      );
      const cantB = (b.ventas_items || []).reduce(
        (acc: number, item: VentaItem) => acc + item.cantidad,
        0,
      );

      switch (orden) {
        case "recientes":
          return (
            new Date(b.fecha_venta).getTime() -
            new Date(a.fecha_venta).getTime()
          );
        case "antiguos":
          return (
            new Date(a.fecha_venta).getTime() -
            new Date(b.fecha_venta).getTime()
          );
        case "mayor_total":
          return b.total - a.total;
        case "mayor_ganancia":
          return gananciaB - gananciaA;
        case "menor_total":
          return a.total - b.total;
        case "mayor_cantidad":
          return cantB - cantA;
        default:
          return 0;
      }
    });

    return resultado;
  }, [ventas, filtroNombre, orden]);

  const totalPaginas = Math.ceil(
    ventasFiltradasYOrdenadas.length / ITEMS_POR_PAGINA,
  );

  const ventasPagina = useMemo(
    () =>
      ventasFiltradasYOrdenadas.slice(
        (paginaActual - 1) * ITEMS_POR_PAGINA,
        paginaActual * ITEMS_POR_PAGINA,
      ),
    [ventasFiltradasYOrdenadas, paginaActual],
  );

  const handleSearchChange = (value: string) => {
    setFiltroNombre(value);
    setPaginaActual(1);
  };

  const handleOrderChange = (value: string) => {
    setOrden(value);
    setPaginaActual(1);
  };

  const abrirTicket = (venta: Venta) => {
    // Obtenemos el descuento de la cabecera si existe
    const descuento =
      venta.ventas_descuentos && venta.ventas_descuentos.length > 0
        ? venta.ventas_descuentos[0]
        : null;

    const pagoInfo =
      venta.venta_pagos && venta.venta_pagos.length > 0
        ? venta.venta_pagos[0]
        : null;
    const clienteNombre = getClienteNombre(venta);
    const pagosDesglosados = (venta.venta_pagos || []).map((pago) => ({
      nombre: pago.metodo_nombre,
      monto: Number(pago.monto_bruto || 0),
      tipo: pago.metodo_tipo,
      comisionMonto: Number(pago.comision_monto || 0),
      montoNeto: Number(pago.monto_neto || 0),
      acreditacionDias: Number(pago.acreditacion_dias || 0),
      tipoMovimiento: pago.tipo_movimiento,
    }));

    const pagosConRecargo = (venta.venta_pagos || []).filter(
      (pago) => Number(pago.recargo_monto || 0) > 0,
    );
    const recargoMetodoMonto = pagosConRecargo.reduce(
      (acc, pago) => acc + Number(pago.recargo_monto || 0),
      0,
    );
    const recargoMetodoEtiqueta =
      pagosConRecargo.length === 1
        ? `Recargo ${pagosConRecargo[0].metodo_nombre} (${pagosConRecargo[0].recargo_porcentaje}%)`
        : "Recargo por método de pago";

    setTicketAbierto({
      items: (venta.ventas_items || []).map(
        (item: VentaItem): TicketItemData => ({
          nombre:
            getSupabaseRelation(item.producto)?.nombre || "Producto eliminado",
          variante: item.variante,
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
        }),
      ),
      total: venta.total,
      metodoPago: getPagoLabel(venta),
      nroRecibo: venta.id.split("-")[0].toUpperCase(),
      fecha: formatearFechaHora(venta.fecha_venta),
      vendedor: getSupabaseRelation(venta.perfiles)?.nombre || "Administrador",
      descuentoMonto: descuento
        ? Number(descuento.monto_descontado)
        : undefined,
      promocionNombre: descuento ? descuento.promocion_nombre : undefined,
      // Reimpresión: el recargo sale de lo que quedó congelado en cada pago,
      // no del % que el método tenga HOY.
      recargoMetodoMonto: recargoMetodoMonto || undefined,
      recargoMetodoEtiqueta: recargoMetodoEtiqueta || undefined,
      comisionMonto: pagoInfo ? Number(pagoInfo.comision_monto) : 0,
      montoNeto: pagoInfo ? Number(pagoInfo.monto_neto) : venta.total,
      acreditacionDias: pagoInfo ? Number(pagoInfo.acreditacion_dias) : 0,
      pagosDesglosados,
      clienteNombre:
        clienteNombre === "Consumidor final" ? undefined : clienteNombre,
      estadoPago: venta.estado_pago ?? undefined,
      montoCobrado: Number(venta.monto_cobrado || 0),
      montoPendiente: Number(venta.monto_pendiente || 0),
    });
  };

  return (
    <div className="space-y-6 px-4 p-2">
      <TicketSheet
        ticket={ticketAbierto}
        config={branding || ({} as ConfiguracionPOS)}
        onClose={() => setTicketAbierto(null)}
      />

      <SaleTableHeader
        searchValue={filtroNombre}
        onSearchChange={handleSearchChange}
        orderValue={orden}
        onOrderChange={handleOrderChange}
        orderOptions={ordenOptions}
      />

      {/* TABLA O EMPTY STATE */}
      {ventas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card rounded-2xl border border-border">
          <Receipt className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium text-lg">
            Aún no hay ventas registradas en el sistema.
          </p>
        </div>
      ) : (
        <>
          {/* VISTA DESKTOP (Tabla tradicional, oculta en móviles) */}
          <div className="hidden md:block rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="w-full min-w-150">
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border/60 hover:bg-muted/30">
                    <TableHead className="w-28 pl-4 sm:pl-6">Ticket</TableHead>
                    <TableHead className="w-42">Fecha</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="w-52">Cliente / Estado</TableHead>
                    <TableHead className="w-28">Pago</TableHead>
                    <TableHead className="text-right font-bold">
                      Total
                    </TableHead>
                    <TableHead className="text-right w-32 pr-4 sm:pr-6">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasPagina.length > 0 ? (
                    ventasPagina.map((venta) => {
                      const items = venta.ventas_items || [];
                      const primerItem = items[0];

                      if (!primerItem) return null;

                      const producto = getSupabaseRelation(primerItem.producto);
                      const isEliminado = !producto;
                      const nombrePrincipal = isEliminado
                        ? "Producto eliminado"
                        : producto.nombre;
                      const itemsExtra = items.length - 1;

                      const clienteNombre = getClienteNombre(venta);
                      const estadoPago = getEstadoPago(venta);
                      const metodoPago = getPagoLabel(venta);
                      const isAnulada =
                        venta.estado_operacion === "ANULADA" ||
                        venta.estado_pago === "ANULADA";

                      return (
                        <TableRow
                          key={venta.id}
                          className="hover:bg-muted/20 cursor-pointer transition-colors border-b border-border/40"
                          onClick={() => abrirTicket(venta)}
                        >
                          <TableCell className="font-mono font-medium tracking-wider text-muted-foreground text-xs pl-4 sm:pl-6">
                            #{venta.id.split("-")[0].toUpperCase()}
                          </TableCell>

                          <TableCell
                            className="text-sm text-muted-foreground"
                            suppressHydrationWarning
                          >
                            {formatearFechaHora(venta.fecha_venta)}
                          </TableCell>

                          <TableCell className="font-semibold text-foreground py-4">
                            <div className="flex items-center gap-3">
                              <span className="truncate max-w-50 sm:max-w-xs">
                                {nombrePrincipal}
                                {itemsExtra > 0 ? (
                                  <span className="text-muted-foreground font-normal ml-1">
                                    y {itemsExtra} artículo
                                    {itemsExtra > 1 ? "s" : ""} más
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground font-normal ml-1">
                                    · Talle {primerItem.variante} · x
                                    {primerItem.cantidad}
                                  </span>
                                )}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {clienteNombre}
                              </p>
                              <span
                                className={`mt-1 text-xs uppercase font-semibold ${
                                  estadoPago.variant === "anulada"
                                    ? "text-destructive"
                                    : estadoPago.estaPagado
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-amber-600"
                                }`}
                              >
                                {estadoPago.label}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase font-bold tracking-widest ${getMetodoPagoColor(metodoPago)}`}
                            >
                              {metodoPago}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="font-mono font-medium text-foreground">
                              {formatearMoneda(venta.total)}
                            </div>
                          </TableCell>

                          <TableCell
                            className="text-right pr-4 sm:pr-6"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground font-medium h-9 w-9 p-0 hover:bg-muted hover:text-foreground rounded-md transition-colors shadow-none"
                                onClick={() => abrirTicket(venta)}
                                title="Ver recibo detallado"
                              >
                                <Eye className="w-4.5 h-4.5" />
                              </Button>

                              {puedeAnular && !isAnulada && (
                                <AnularVentaModal
                                  id={venta.id}
                                  productoNombre={
                                    itemsExtra > 0
                                      ? "Ticket Completo"
                                      : nombrePrincipal || "Varios artículos"
                                  }
                                  cantidad={
                                    itemsExtra > 0
                                      ? venta.cantidad
                                      : primerItem.cantidad
                                  }
                                  variante={
                                    itemsExtra > 0
                                      ? "Varios artículos"
                                      : primerItem.variante
                                  }
                                  isProductoEliminado={isEliminado}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-32 text-center text-muted-foreground bg-card"
                      >
                        No se encontraron tickets que coincidan con la búsqueda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* VISTA MOBILE (Tarjetas apiladas, ocultas en desktop) */}
          <div className="md:hidden flex flex-col gap-3">
            {ventasPagina.length > 0 ? (
              ventasPagina.map((venta) => {
                const items = venta.ventas_items || [];
                const primerItem = items[0];

                if (!primerItem) return null;

                const producto = getSupabaseRelation(primerItem.producto);
                const isEliminado = !producto;
                const nombrePrincipal = isEliminado
                  ? "Producto eliminado"
                  : producto.nombre;
                const itemsExtra = items.length - 1;

                const clienteNombre = getClienteNombre(venta);
                const estadoPago = getEstadoPago(venta);
                const metodoPago = getPagoLabel(venta);
                const isAnulada =
                  venta.estado_operacion === "ANULADA" ||
                  venta.estado_pago === "ANULADA";

                return (
                  <div
                    key={venta.id}
                    onClick={() => abrirTicket(venta)}
                    className="bg-card border border-border rounded-xl p-4 active:scale-[0.98] transition-transform cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col pr-3">
                        <span className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
                          #{venta.id.split("-")[0].toUpperCase()}
                        </span>
                        <span className="font-bold text-foreground text-sm mt-1 leading-tight line-clamp-2">
                          {nombrePrincipal}
                        </span>
                        {itemsExtra > 0 ? (
                          <span className="text-muted-foreground text-xs mt-0.5">
                            y {itemsExtra} artículo{itemsExtra > 1 ? "s" : ""}{" "}
                            más
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs mt-0.5">
                            Talle {primerItem.variante} · x{primerItem.cantidad}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-foreground text-lg">
                          {formatearMoneda(venta.total)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mb-3">
                      <Badge
                        variant="outline"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight ${getMetodoPagoColor(metodoPago)}`}
                      >
                        {metodoPago}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight ${
                          estadoPago.variant === "anulada"
                            ? "border-destructive/20 bg-destructive/10 text-destructive"
                            : estadoPago.estaPagado
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {estadoPago.label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-xs text-muted-foreground font-medium truncate">
                        {clienteNombre}
                      </span>
                      <span
                        className="text-xs text-muted-foreground font-medium shrink-0"
                        suppressHydrationWarning
                      >
                        {formatearFechaHora(venta.fecha_venta)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <span className="text-xs font-medium text-muted-foreground truncate pr-2">
                        Ticket #{venta.id.split("-")[0].toUpperCase()}
                      </span>
                      <div
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg shadow-none hover:bg-muted"
                          onClick={() => abrirTicket(venta)}
                          title="Ver recibo detallado"
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        {puedeAnular && !isAnulada && (
                          <div className="[&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg [&>button]:border [&>button]:border-transparent [&>button:hover]:border-rose-200">
                            <AnularVentaModal
                              id={venta.id}
                              productoNombre={
                                itemsExtra > 0
                                  ? "Ticket Completo"
                                  : nombrePrincipal || "Varios artículos"
                              }
                              cantidad={
                                itemsExtra > 0
                                  ? venta.cantidad
                                  : primerItem.cantidad
                              }
                              variante={
                                itemsExtra > 0
                                  ? "Varios artículos"
                                  : primerItem.variante
                              }
                              isProductoEliminado={isEliminado}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-muted-foreground bg-card rounded-xl border border-border">
                No se encontraron tickets que coincidan con la búsqueda.
              </div>
            )}
          </div>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4 border-t border-border mt-4">
              <span className="text-xs font-medium text-muted-foreground">
                Mostrando{" "}
                {Math.min(
                  ventasFiltradasYOrdenadas.length,
                  (paginaActual - 1) * ITEMS_POR_PAGINA + 1,
                )}{" "}
                a{" "}
                {Math.min(
                  ventasFiltradasYOrdenadas.length,
                  paginaActual * ITEMS_POR_PAGINA,
                )}{" "}
                de {ventasFiltradasYOrdenadas.length} tickets
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shadow-none"
                  onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                  disabled={paginaActual === 1}
                >
                  <ChevronLeft className="w-4 h-4 sm:mr-1" />{" "}
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
                <div className="text-xs font-bold px-3">
                  {paginaActual} / {totalPaginas}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shadow-none"
                  onClick={() =>
                    setPaginaActual((p) => Math.min(totalPaginas, p + 1))
                  }
                  disabled={paginaActual === totalPaginas}
                >
                  <span className="hidden sm:inline">Siguiente</span>{" "}
                  <ChevronRight className="w-4 h-4 sm:ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
