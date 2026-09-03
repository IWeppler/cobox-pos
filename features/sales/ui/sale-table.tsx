"use client";

import { useState, useMemo, useEffect } from "react";
import {
  TicketData,
  TicketItemData,
  Venta,
  VentaItem,
  getSupabaseRelation,
} from "@/entities/ventas/types";
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
import { CorregirPagoModal } from "./corregir-pago-modal";
import { Button } from "@/shared/ui/button";
import { TicketSheet } from "./ticket-sheet";
import { formatearFechaHora, formatearMoneda } from "@/shared/utils/formatters";
import { numeroTicketVenta } from "@/features/sales/lib/numero-ticket";
import { SaleTableHeader } from "./sale-table-header";
import {
  ESTADO_TODOS,
  METODO_TODOS,
  type EstadoVentaFiltro,
} from "./sale-table-filtros";

const ITEMS_POR_PAGINA = 10;

interface VentasTableProps {
  ventas: Venta[];
  userRole: string;
  puedeAnular: boolean;
  /** Permiso `ventas.corregir_pago`. Separado de `puedeAnular` a propósito:
   * corregir el medio de cobro de la venta propia en el turno abierto no
   * cancela nada, y es lo que hoy obliga a llamar a la dueña. */
  puedeCorregirPago?: boolean;
}

export function VentasTable({
  ventas = [],
  userRole,
  puedeAnular,
  puedeCorregirPago = false,
}: Readonly<VentasTableProps>) {
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroEstado, setFiltroEstado] =
    useState<EstadoVentaFiltro>(ESTADO_TODOS);
  const [filtroMetodo, setFiltroMetodo] = useState<string>(METODO_TODOS);
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

  /**
   * El cobro de una venta corregible, o null.
   *
   * Corregir el método solo tiene sentido —y solo lo permite la RPC— cuando hay
   * UN cobro y la venta no quedó con deuda: con pago mixto «cambiar el método»
   * no dice de cuál de los dos se habla, y con deuda el cambio toca el saldo
   * del cliente. Los dos casos se rechazan igual en el server; acá se usan para
   * no ofrecer un botón que va a fallar.
   *
   * El chequeo que NO se puede hacer acá es el del turno abierto, que es el más
   * frecuente. Ese lo contesta la RPC y el modal lo muestra como error.
   */
  const cobroCorregible = (venta: Venta) => {
    if (venta.estado_operacion === "ANULADA") return null;
    if (Number(venta.monto_pendiente || 0) > 0) return null;

    const cobros = (venta.venta_pagos || []).filter(
      (pago) => (pago.tipo_movimiento ?? "PAGO_VENTA") === "PAGO_VENTA",
    );

    return cobros.length === 1 ? cobros[0] : null;
  };

  const getPagoLabel = (venta: Venta) => {
    const pagos = venta.venta_pagos || [];
    if (venta.es_pago_mixto || pagos.length > 1) return "Mixto";
    return pagos[0]?.metodo_nombre || venta.metodo_pago || "EFECTIVO";
  };

  /**
   * Los métodos de pago que REALMENTE aparecen en el historial cargado, no la
   * lista de `metodos_pago`.
   *
   * Es lo que hace que el filtro no ofrezca nunca una opción vacía: un método
   * configurado la semana pasada y todavía sin usar daría cero resultados, y un
   * método ya desactivado —pero presente en ventas viejas— no se podría filtrar
   * si la lista saliera de la configuración de hoy. Las etiquetas son las
   * mismas que muestra la columna, `getPagoLabel`, "Mixto" incluido.
   */
  const metodosPresentes = useMemo(() => {
    const vistos = new Set<string>();
    for (const venta of ventas) vistos.add(getPagoLabel(venta));
    return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
  }, [ventas]);

  const ventasFiltradasYOrdenadas = useMemo(() => {
    const resultado = ventas.filter((venta) => {
      const items = venta.ventas_items || [];
      if (items.length === 0) return false;

      // Se busca por TICKET y por CLIENTE, ya no por producto. El producto
      // estaba de más: los nombres del catálogo se repiten en cientos de
      // ventas, así que buscar "remera" devolvía media pantalla y no ayudaba a
      // encontrar UNA venta. Lo que se busca en un historial es un ticket que
      // alguien tiene en la mano o las compras de una clienta que está
      // enfrente.
      //
      // El `#` se ignora para que se pueda pegar el número tal como está
      // impreso, y el match es por `includes`: tipear "417" encuentra
      // "0001-00000417" sin obligar a escribir los ceros.
      const busqueda = filtroNombre.toLowerCase().replace(/#/g, "").trim();
      const coincideBusqueda =
        busqueda === "" ||
        numeroTicketVenta(venta).toLowerCase().includes(busqueda) ||
        getClienteNombre(venta).toLowerCase().includes(busqueda);

      if (!coincideBusqueda) return false;

      if (filtroEstado !== ESTADO_TODOS) {
        if (getEstadoPago(venta).variant !== filtroEstado) return false;
      }

      if (filtroMetodo !== METODO_TODOS) {
        if (getPagoLabel(venta) !== filtroMetodo) return false;
      }

      return true;
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
  }, [ventas, filtroNombre, filtroEstado, filtroMetodo, orden]);

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

  // Volver a la página 1 con cada filtro no es un detalle: filtrando desde la
  // página 4 el resultado puede tener 2 páginas, y la tabla se quedaría
  // mostrando una página vacía sobre un filtro que sí tiene resultados.
  const handleEstadoChange = (value: string) => {
    setFiltroEstado(value as EstadoVentaFiltro);
    setPaginaActual(1);
  };

  const handleMetodoChange = (value: string) => {
    setFiltroMetodo(value);
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
          imei: getSupabaseRelation(item.unidad_serie)?.imei ?? null,
          unidadMedida:
            getSupabaseRelation(item.producto)?.unidad_medida ?? null,
        }),
      ),
      total: venta.total,
      metodoPago: getPagoLabel(venta),
      // Las ventas anteriores a los comprobantes no tienen ninguno, y las que
      // fallaron al emitir tampoco: ahí se reimprime el identificador de la
      // venta, igual que siempre. Se toma el comprobante de emisión (el
      // primero), no una nota de crédito posterior.
      nroRecibo: numeroTicketVenta(venta),
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
        estadoValue={filtroEstado}
        onEstadoChange={handleEstadoChange}
        metodoValue={filtroMetodo}
        onMetodoChange={handleMetodoChange}
        metodosOptions={metodosPresentes}
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
                          {/* EL MISMO número que sale impreso en el recibo.
                              Ver `numero-ticket.ts`: antes acá iba el prefijo
                              del UUID y en el papel el número del
                              comprobante, así que con el ticket en la mano no
                              había forma de encontrar la fila. */}
                          <TableCell className="font-mono font-medium tracking-wider text-muted-foreground text-xs pl-4 sm:pl-6">
                            #{numeroTicketVenta(venta)}
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
                            {/* IMEI a la vista en el listado: es el dato por
                                el que se busca una venta cuando alguien
                                vuelve con el aparato. */}
                            {getSupabaseRelation(primerItem.unidad_serie)
                              ?.imei && (
                              <p className="mt-1 font-mono text-[10px] font-normal text-muted-foreground">
                                IMEI{" "}
                                {
                                  getSupabaseRelation(primerItem.unidad_serie)
                                    ?.imei
                                }
                              </p>
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {clienteNombre}
                              </p>
                              <span
                                className={`mt-1 text-xs uppercase font-semibold ${
                                  estadoPago.variant === "anulada"
                                    ? "text-danger"
                                    : estadoPago.estaPagado
                                      ? "text-success"
                                      : "text-warning"
                                }`}
                              >
                                {estadoPago.label}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                              {metodoPago}
                            </p>
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

                              {puedeCorregirPago &&
                                (() => {
                                  const cobro = cobroCorregible(venta);
                                  return cobro ? (
                                    <CorregirPagoModal
                                      ventaId={venta.id}
                                      metodoActualId={cobro.metodo_pago_id}
                                      metodoActualNombre={cobro.metodo_nombre}
                                      montoBase={Number(
                                        cobro.monto_base ?? cobro.monto_bruto,
                                      )}
                                      totalActual={Number(venta.total)}
                                      recargoActual={Number(
                                        venta.recargo_metodo_total || 0,
                                      )}
                                    />
                                  ) : null;
                                })()}

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
                        {getSupabaseRelation(primerItem.unidad_serie)?.imei && (
                          <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            IMEI{" "}
                            {getSupabaseRelation(primerItem.unidad_serie)?.imei}
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
                      <p
                        className={`inline-flex items-center text-[11px] font-semibold text-muted-foreground`}
                      >
                        {metodoPago}
                      </p>
                      <Badge
                        variant="outline"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight ${
                          estadoPago.variant === "anulada"
                            ? "border-destructive/20 bg-destructive/10 text-destructive"
                            : estadoPago.estaPagado
                              ? "border-success/20 bg-success/10 text-success"
                              : "border-warning/20 bg-warning/10 text-warning"
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
                        Ticket #{numeroTicketVenta(venta)}
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
                        {puedeCorregirPago &&
                          (() => {
                            const cobro = cobroCorregible(venta);
                            return cobro ? (
                              <CorregirPagoModal
                                ventaId={venta.id}
                                metodoActualId={cobro.metodo_pago_id}
                                metodoActualNombre={cobro.metodo_nombre}
                                montoBase={Number(
                                  cobro.monto_base ?? cobro.monto_bruto,
                                )}
                                totalActual={Number(venta.total)}
                                recargoActual={Number(
                                  venta.recargo_metodo_total || 0,
                                )}
                              />
                            ) : null;
                          })()}

                        {puedeAnular && !isAnulada && (
                          <div className="[&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg [&>button]:border [&>button]:border-transparent [&>button:hover]:border-danger/10">
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
