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
import { Download, Eye, Plus, Receipt } from "lucide-react";
import { AnularVentaModal } from "./cancel-sale-modal";
import { Button } from "@/shared/ui/button";
import { TicketSheet } from "./ticket-sheet";
import { formatearFechaHora, formatearMoneda } from "@/shared/utils/formatters";
import { getMetodoPagoColor } from "@/shared/utils/payment-methods";
import { SaleTableHeader } from "./sale-table-header";
import Link from "next/link";

interface VentasTableProps {
  ventas: Venta[];
  productos: Producto[];
  userRole: string;
}

export function VentasTable({
  ventas = [],
  userRole,
}: Readonly<VentasTableProps>) {
  const [filtroNombre, setFiltroNombre] = useState("");
  const [orden, setOrden] = useState("recientes");

  const [ticketAbierto, setTicketAbierto] = useState<TicketData | null>(null);
  const [branding, setBranding] = useState<ConfiguracionPOS | null>(null);

  const isAdmin = userRole === "ADMIN";

  // Obtenemos la configuración de branding para los tickets
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

  const ventasFiltradasYOrdenadas = useMemo(() => {
    const resultado = ventas.filter((venta) => {
      const items = venta.ventas_items || [];
      if (items.length === 0) return false;

      const searchLower = filtroNombre.toLowerCase().replace("#", "");
      const numeroRecibo = venta.id.split("-")[0].toLowerCase();
      const matchRecibo = numeroRecibo.includes(searchLower);

      const matchesFiltros = items.some((item: VentaItem) => {
        const producto = getSupabaseRelation(item.producto);
        const nombre = producto?.nombre?.toLowerCase() || "";
        return nombre.includes(searchLower) || matchRecibo;
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
      metodoPago: pagoInfo?.metodo_nombre || venta.metodo_pago || "EFECTIVO",
      nroRecibo: venta.id.split("-")[0].toUpperCase(),
      fecha: formatearFechaHora(venta.fecha_venta),
      vendedor: getSupabaseRelation(venta.perfiles)?.nombre || "Administrador",
      descuentoMonto: descuento
        ? Number(descuento.monto_descontado)
        : undefined,
      promocionNombre: descuento ? descuento.promocion_nombre : undefined,
      comisionMonto: pagoInfo ? Number(pagoInfo.comision_monto) : 0,
      montoNeto: pagoInfo ? Number(pagoInfo.monto_neto) : venta.total,
      acreditacionDias: pagoInfo ? Number(pagoInfo.acreditacion_dias) : 0,
    });
  };

  return (
    <div className="space-y-6">
      <TicketSheet
        ticket={ticketAbierto}
        config={branding || ({} as ConfiguracionPOS)}
        onClose={() => setTicketAbierto(null)}
      />

      <SaleTableHeader
        searchValue={filtroNombre}
        onSearchChange={setFiltroNombre}
        orderValue={orden}
        onOrderChange={setOrden}
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
          <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="w-full min-w-150">
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border/60 hover:bg-muted/30">
                    <TableHead className="w-28 pl-4 sm:pl-6">Recibo</TableHead>
                    <TableHead>Resumen de Venta</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Fecha
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      Vendedor
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">Pago</TableHead>
                    <TableHead className="text-right font-bold">
                      Total
                    </TableHead>
                    <TableHead className="text-right w-32 pr-4 sm:pr-6">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasFiltradasYOrdenadas.length > 0 ? (
                    ventasFiltradasYOrdenadas.map((venta) => {
                      const items = venta.ventas_items || [];
                      const primerItem = items[0];

                      if (!primerItem) return null;

                      const producto = getSupabaseRelation(primerItem.producto);
                      const isEliminado = !producto;
                      const nombrePrincipal = isEliminado
                        ? "Producto eliminado"
                        : producto.nombre;
                      const itemsExtra = items.length - 1;

                      const gananciaNeta =
                        venta.total - (venta.precio_costo || 0);
                      const nombreVendedor =
                        getSupabaseRelation(venta.perfiles)?.nombre ||
                        "Administrador";
                      const metodoPago = venta.metodo_pago || "EFECTIVO";

                      return (
                        <TableRow
                          key={venta.id}
                          className="hover:bg-muted/20 cursor-pointer transition-colors border-b border-border/40"
                          onClick={() => abrirTicket(venta)}
                        >
                          <TableCell className="font-bold text-muted-foreground text-xs pl-4 sm:pl-6">
                            #{venta.id.split("-")[0].toUpperCase()}
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

                          {/* ¡Agregamos suppressHydrationWarning aquí! */}
                          <TableCell
                            className="text-sm text-muted-foreground hidden sm:table-cell"
                            suppressHydrationWarning
                          >
                            {formatearFechaHora(venta.fecha_venta)}
                          </TableCell>

                          <TableCell className="text-sm font-medium text-muted-foreground hidden md:table-cell">
                            {nombreVendedor}
                          </TableCell>

                          <TableCell className="hidden sm:table-cell">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase font-bold tracking-widest shadow-none ${getMetodoPagoColor(metodoPago)}`}
                            >
                              {metodoPago}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="font-semibold text-foreground text-base">
                              {formatearMoneda(venta.total)}
                            </div>
                            {isAdmin && (
                              <div
                                className="text-[11px] font-medium text-emerald-600 mt-0.5"
                                title="Ganancia neta del ticket"
                              >
                                +{formatearMoneda(gananciaNeta)}
                              </div>
                            )}
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

                              {isAdmin && (
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
            {ventasFiltradasYOrdenadas.length > 0 ? (
              ventasFiltradasYOrdenadas.map((venta) => {
                const items = venta.ventas_items || [];
                const primerItem = items[0];

                if (!primerItem) return null;

                const producto = getSupabaseRelation(primerItem.producto);
                const isEliminado = !producto;
                const nombrePrincipal = isEliminado
                  ? "Producto eliminado"
                  : producto.nombre;
                const itemsExtra = items.length - 1;

                const gananciaNeta = venta.total - (venta.precio_costo || 0);
                const nombreVendedor =
                  getSupabaseRelation(venta.perfiles)?.nombre ||
                  "Administrador";
                const metodoPago = venta.metodo_pago || "EFECTIVO";

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
                        {isAdmin && (
                          <div className="text-[11px] font-medium text-emerald-600 mt-0.5 text-right">
                            +{formatearMoneda(gananciaNeta)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                      <Badge
                        variant="outline"
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight ${getMetodoPagoColor(metodoPago)}`}
                      >
                        {metodoPago}
                      </Badge>
                      <span
                        className="text-xs text-muted-foreground font-medium"
                        suppressHydrationWarning
                      >
                        {formatearFechaHora(venta.fecha_venta)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <span className="text-xs font-medium text-muted-foreground truncate pr-2">
                        Vend: {nombreVendedor}
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
                        {isAdmin && (
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
        </>
      )}
    </div>
  );
}
