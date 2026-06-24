"use client";

import { useState, useMemo, useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import {
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  CreditCard,
  Lock,
  Unlock,
  Loader2,
  Info,
  Clock,
  Percent,
  Ticket,
} from "lucide-react";
import { EgresoModal } from "./egreso-modal";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { abrirTurnoAction, cerrarTurnoAction } from "../actions/open-caja";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import {
  TurnoCajaHistorial,
  EgresoCaja,
  CajaActionState,
} from "@/entities/caja/types";
import { CajaHistoryTable } from "./caja-history-table";

const formatearMoneda = (monto: number) => {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
};

export interface CajaDashboardProps {
  turno: TurnoCajaHistorial | null;
  ventas: any[];
  egresos: EgresoCaja[];
  historial: TurnoCajaHistorial[];
}

// Interfaz local extendida para soportar comisiones
type MovimientoExtendido = {
  id: string;
  tipo: "INGRESO" | "EGRESO";
  concepto: string;
  metodo: string;
  metodo_tipo: string;
  monto: number; // Bruto
  comision: number;
  neto: number;
  fecha: string;
  usuario: string;
};

export function CajaDashboard({
  turno,
  ventas,
  egresos,
  historial,
}: Readonly<CajaDashboardProps>) {
  const [isCerrarOpen, setIsCerrarOpen] = useState(false);

  const [, abrirAction, isAbrirPending] = useActionState(
    async (prevState: CajaActionState, formData: FormData) => {
      const res = await abrirTurnoAction(prevState, formData);
      if (res.success) toast.success("Caja abierta correctamente.");
      else toast.error(res.error);
      return res;
    },
    { error: null, success: false },
  );

  const [, cerrarAction, isCerrarPending] = useActionState(
    async (prevState: CajaActionState, formData: FormData) => {
      const res = await cerrarTurnoAction(prevState, formData);
      if (res.success) {
        toast.success("Turno cerrado. Arqueo guardado.");
        setIsCerrarOpen(false);
      } else {
        toast.error(res.error);
      }
      return res;
    },
    { error: null, success: false },
  );

  // --- LÓGICA DE CÁLCULO DEL TURNO ABIERTO (PAGOS MIXTOS READY) ---
  const { movimientos, totales } = useMemo(() => {
    if (!turno)
      return {
        movimientos: [],
        totales: {
          fondoInicial: 0,
          ingresosEfectivo: 0,
          ingresosDigitalesBruto: 0,
          comisionesRetenidas: 0,
          ingresosDigitalesNeto: 0,
          totalEgresos: 0,
          efectivoEsperado: 0,
          totalFacturado: 0,
        },
      };

    const ventasMapeadas: MovimientoExtendido[] = ventas.flatMap((v) => {
      const pagos = v.venta_pagos || [];
      const conceptoVenta = `Venta: ${v.ventas_items?.[0]?.producto?.nombre || "Varios"}`;

      if (pagos.length > 0) {
        return pagos.map((pago: any) => ({
          id: `${v.id}-${pago.id || Math.random()}`,
          tipo: "INGRESO",
          concepto: conceptoVenta,
          metodo: pago.metodo_nombre,
          metodo_tipo: pago.metodo_tipo,
          monto: Number(pago.monto_bruto),
          comision: Number(pago.comision_monto),
          neto: Number(pago.monto_neto),
          fecha: v.fecha_venta,
          usuario: v.perfiles?.nombre || "Vendedor",
        }));
      } else {
        // Fallback para ventas viejas que no usaron venta_pagos
        const isEfectivo = v.metodo_pago === "EFECTIVO";
        return [
          {
            id: v.id,
            tipo: "INGRESO",
            concepto: conceptoVenta,
            metodo: v.metodo_pago || "EFECTIVO",
            metodo_tipo: isEfectivo ? "EFECTIVO" : "TARJETA",
            monto: Number(v.total),
            comision: 0,
            neto: Number(v.total),
            fecha: v.fecha_venta,
            usuario: v.perfiles?.nombre || "Vendedor",
          },
        ];
      }
    });

    const egresosMapeados: MovimientoExtendido[] = egresos.map((e) => ({
      id: e.id,
      tipo: "EGRESO",
      concepto: `Gasto: ${e.concepto}`,
      metodo: "CAJA FÍSICA",
      metodo_tipo: "EFECTIVO",
      monto: Number(e.monto),
      comision: 0,
      neto: Number(e.monto),
      fecha: e.fecha,
      usuario: e.perfiles?.nombre || "Usuario",
    }));

    const todos = [...ventasMapeadas, ...egresosMapeados].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );

    const ingresosEfectivo = ventasMapeadas
      .filter((m) => m.metodo_tipo === "EFECTIVO")
      .reduce((acc, m) => acc + m.monto, 0);

    const digitales = ventasMapeadas.filter(
      (m) => m.metodo_tipo !== "EFECTIVO",
    );
    const ingresosDigitalesBruto = digitales.reduce(
      (acc, m) => acc + m.monto,
      0,
    );
    const comisionesRetenidas = digitales.reduce(
      (acc, m) => acc + m.comision,
      0,
    );
    const ingresosDigitalesNeto = digitales.reduce((acc, m) => acc + m.neto, 0);

    const totalEgresos = egresosMapeados.reduce((acc, m) => acc + m.monto, 0);
    const fondoInicial = Number(turno.monto_inicial);

    const efectivoEsperado = Math.max(
      0,
      fondoInicial + ingresosEfectivo - totalEgresos,
    );

    return {
      movimientos: todos,
      totales: {
        fondoInicial,
        ingresosEfectivo,
        ingresosDigitalesBruto,
        comisionesRetenidas,
        ingresosDigitalesNeto,
        totalEgresos,
        efectivoEsperado,
        totalFacturado: ingresosEfectivo + ingresosDigitalesBruto,
      },
    };
  }, [ventas, egresos, turno]);

  return (
    <div className="space-y-8 animate-in fade-in-50">
      {/* SECCIÓN 1: ESTADO ACTUAL (ABIERTA O CERRADA) */}
      {!turno ? (
        <Card className="border-border bg-background shadow-none overflow-hidden rounded-2xl">
          <div className="flex flex-col md:flex-row">
            <div className="p-6 md:p-10 md:w-1/2 flex flex-col justify-center">
              <div className="w-12 h-12 bg-primary/5 text-primary border border-primary/30 rounded-xl flex items-center justify-center mb-5">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-3 tracking-tight">
                La caja está cerrada
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Antes de comenzar a registrar ventas o movimientos de dinero,
                debes iniciar un nuevo turno de caja declarando el efectivo
                inicial.
              </p>
            </div>
            <div className="p-6 md:p-10 md:w-1/2 border-t md:border-t-0 md:border-l border-border bg-card flex flex-col justify-center">
              <form action={abrirAction} className="space-y-6">
                <div className="space-y-3">
                  <Label
                    htmlFor="monto_inicial"
                    className="text-lg font-semibold text-foreground flex items-center gap-2"
                  >
                    <Ticket className="w-5 h-5 text-muted-foreground" />
                    Efectivo en caja
                  </Label>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                      $
                    </span>
                    <Input
                      id="monto_inicial"
                      name="monto_inicial"
                      type="number"
                      min="0"
                      required
                      className="pl-9 text-lg font-bold h-12 shadow-none rounded-xl border-border/60 hover:border-foreground/40 focus-visible:border-foreground transition-colors bg-[#f5f4f4] focus-visible:bg-background"
                      placeholder="Ej: 5000"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Monto de cambio (billetes/monedas) en el cajón.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={isAbrirPending}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl shadow-none cursor-pointer transition-colors"
                >
                  {isAbrirPending ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Unlock className="w-5 h-5 mr-2" />
                  )}
                  Abrir Turno
                </Button>
              </form>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 sm:p-5 rounded-2xl border border-border shadow-none">
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full items-center justify-center border border-emerald-100">
                <Unlock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 "></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                    Turno Abierto
                  </span>
                </div>
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Apertura:{" "}
                  {new Date(turno.fecha_apertura).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <EgresoModal />

              <Dialog open={isCerrarOpen} onOpenChange={setIsCerrarOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto shadow-none cursor-pointer">
                    <Lock className="w-4 h-4 mr-2" /> Cierre Z (Arqueo)
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-105 p-0 overflow-hidden border-border shadow-2xl">
                  <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-xl font-bold">
                      Cierre de Caja
                    </DialogTitle>
                  </DialogHeader>

                  <div className="px-6 py-4">
                    <div className="bg-[#f5f4f4] p-5 rounded-xl border border-border/50 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">
                          Fondo Inicial
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatearMoneda(totales.fondoInicial)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">
                          Ventas (Efectivo)
                        </span>
                        <span className="font-semibold text-emerald-600">
                          +{formatearMoneda(totales.ingresosEfectivo)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">
                          Gastos (Efectivo)
                        </span>
                        <span className="font-semibold text-rose-600">
                          -{formatearMoneda(totales.totalEgresos)}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold text-base pt-3 border-t border-border mt-1">
                        <span className="text-foreground">
                          Efectivo Esperado
                        </span>
                        <span className="text-emerald-700">
                          {formatearMoneda(totales.efectivoEsperado)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <form action={cerrarAction} className="px-6 pb-6 space-y-5">
                    <input type="hidden" name="turno_id" value={turno.id} />
                    <input
                      type="hidden"
                      name="efectivo_esperado"
                      value={totales.efectivoEsperado}
                    />
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Efectivo real en cajón
                      </Label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                          $
                        </span>
                        <Input
                          name="monto_final"
                          type="number"
                          min="0"
                          required
                          className="pl-9 font-bold h-12 text-lg shadow-none rounded-xl border-border/60 hover:border-foreground/40 focus-visible:border-foreground bg-background"
                          placeholder={totales.efectivoEsperado.toString()}
                        />
                      </div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1 mt-1 font-semibold">
                        <Info className="w-3 h-3" /> El sistema calculará
                        diferencias
                      </p>
                    </div>
                    <Button
                      type="submit"
                      disabled={isCerrarPending}
                      className="w-full h-12 bg-neutral-900 hover:bg-neutral-800 text-background font-bold rounded-xl shadow-none cursor-pointer"
                    >
                      {isCerrarPending
                        ? "Cerrando turno..."
                        : "Confirmar Cierre"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* 🚀 TARJETAS SEPARADAS: FÍSICO VS DIGITAL */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* BLOQUE FÍSICO */}
            <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-2xl border border-border/50">
              <div className="col-span-2 flex items-center gap-2 mb-1">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-foreground">
                  Flujo Físico (En Cajón)
                </h3>
              </div>
              <Card className="bg-card border border-emerald-200 shadow-none">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-500">
                    Efectivo Esperado
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-2xl font-black text-emerald-700 tracking-tight">
                    {formatearMoneda(totales.efectivoEsperado)}
                  </div>
                </CardContent>
              </Card>
              <div className="flex flex-col gap-2">
                <Card className="bg-card border-border shadow-none flex-1">
                  <CardContent className="p-3 flex justify-between items-center h-full">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Fondo Inicial
                    </span>
                    <span className="font-bold text-sm">
                      {formatearMoneda(totales.fondoInicial)}
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-rose-50/50 border-rose-100 shadow-none flex-1">
                  <CardContent className="p-3 flex justify-between items-center h-full">
                    <span className="text-[10px] font-bold uppercase text-rose-800">
                      Egresos
                    </span>
                    <span className="font-bold text-sm text-rose-700">
                      -{formatearMoneda(totales.totalEgresos)}
                    </span>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* BLOQUE DIGITAL */}
            <div className="grid grid-cols-2 gap-4 bg-blue-50/30 p-4 rounded-2xl border border-blue-100/50">
              <div className="col-span-2 flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-foreground">
                  Cobros Digitales
                </h3>
              </div>
              <Card className="bg-white border-blue-200 shadow-none">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-blue-800">
                    Neto Estimado
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-2xl font-black text-blue-700 tracking-tight">
                    {formatearMoneda(totales.ingresosDigitalesNeto)}
                  </div>
                </CardContent>
              </Card>
              <div className="flex flex-col gap-2">
                <Card className="bg-card border-border shadow-none flex-1">
                  <CardContent className="p-3 flex justify-between items-center h-full">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Bruto
                    </span>
                    <span className="font-bold text-sm">
                      {formatearMoneda(totales.ingresosDigitalesBruto)}
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border shadow-none flex-1">
                  <CardContent className="p-3 flex justify-between items-center h-full">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                      <Percent className="w-3 h-3" /> Comisión
                    </span>
                    <span className="font-bold text-sm text-rose-600">
                      -{formatearMoneda(totales.comisionesRetenidas)}
                    </span>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Tabla de Movimientos del Turno Abierto */}
          <Card className="border-border shadow-none overflow-hidden bg-card rounded-2xl">
            <CardHeader className="bg-transparent border-b border-border py-4 px-5">
              <CardTitle className="text-base flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  Movimientos de Hoy
                </div>
                <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  Total Facturado (Bruto):{" "}
                  <Badge
                    variant="secondary"
                    className="bg-muted text-foreground font-bold text-sm shadow-none rounded-md px-2 py-0.5"
                  >
                    {formatearMoneda(totales.totalFacturado)}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-muted-foreground text-xs uppercase font-bold tracking-widest">
                  <tr>
                    <th className="px-5 py-3 border-b border-border">Hora</th>
                    <th className="px-5 py-3 border-b border-border">
                      Concepto
                    </th>
                    <th className="px-5 py-3 border-b border-border">Método</th>
                    <th className="px-5 py-3 text-right border-b border-border">
                      Monto
                    </th>
                    <th className="px-5 py-3 hidden sm:table-cell border-b border-border">
                      Usuario
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {movimientos.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-muted-foreground bg-transparent"
                      >
                        Aún no hay movimientos registrados en este turno.
                      </td>
                    </tr>
                  ) : (
                    movimientos.map((mov) => (
                      <tr
                        key={`${mov.tipo}-${mov.id}`}
                        className="hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap text-xs font-medium">
                          {new Date(mov.fecha).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-foreground">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`p-1 rounded-md ${mov.tipo === "INGRESO" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}
                            >
                              {mov.tipo === "INGRESO" ? (
                                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                              )}
                            </div>
                            <span className="truncate max-w-50 sm:max-w-75">
                              {mov.concepto}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-bold uppercase shadow-none bg-muted/50"
                          >
                            {mov.metodo}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold tracking-tight">
                          <div
                            className={
                              mov.tipo === "INGRESO"
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }
                          >
                            {mov.tipo === "INGRESO" ? "+" : "-"}
                            {formatearMoneda(mov.monto)}
                          </div>
                          {mov.comision > 0 && (
                            <div className="text-[10px] text-rose-500/80 font-medium mt-0.5">
                              Comisión: -{formatearMoneda(mov.comision)}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell text-xs">
                          {mov.usuario}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* SECCIÓN 2: HISTORIAL DE TURNOS (SIEMPRE VISIBLE) */}
      <CajaHistoryTable historial={historial} />
    </div>
  );
}
