"use client";

import { useState, useMemo, useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import {
  Banknote,
  CreditCard,
  Lock,
  Unlock,
  Loader2,
  Info,
  Clock,
  ShoppingBag,
  BookUser,
  TrendingDown,
} from "lucide-react";
import { EgresoModal } from "./egreso-modal";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { abrirTurnoAction, cerrarTurnoAction } from "../actions/caja-action";
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
  VentaCaja,
} from "@/entities/caja/types";
import { VentaPago, getSupabaseRelation } from "@/entities/ventas/types";
import { CajaHistoryTable } from "./caja-history-table";
import { formatearMoneda } from "@/shared/utils/formatters";

export interface CajaDashboardProps {
  turnosAbiertos: TurnoCajaHistorial[];
  ventas: VentaCaja[];
  pagosSueltos: VentaPago[];
  egresos: EgresoCaja[];
  historial: TurnoCajaHistorial[];
  modoCaja?: string;
  userRole?: string;
  userId?: string;
}

type MovimientoExtendido = {
  id: string;
  tipo: "INGRESO" | "EGRESO";
  origen: "VENTA" | "COBRO_DEUDA" | "EGRESO";
  concepto: string;
  metodo: string;
  metodo_tipo: string;
  monto: number;
  comision: number;
  neto: number;
  fecha: string;
  usuario: string;
};

export function CajaDashboard({
  turnosAbiertos,
  ventas,
  pagosSueltos,
  egresos,
  historial,
  modoCaja: _modoCaja,
  userRole: _userRole,
  userId,
}: Readonly<CajaDashboardProps>) {
  const router = useRouter();
  const [isCerrarOpen, setIsCerrarOpen] = useState(false);
  const [turnosCerradosOptimistas, setTurnosCerradosOptimistas] = useState<
    string[]
  >([]);
  void _modoCaja;
  void _userRole;

  // El turno propio se matchea siempre por vendedor_id en modo POR_USUARIO,
  // donde cada vendedor tiene su propia caja. En modo UNICA la caja es una
  // sola compartida por todo el local, así que cualquier usuario opera
  // contra el mismo turno sin importar quién lo abrió.
  const turnosVigentes = turnosAbiertos.filter(
    (turnoAbierto) => !turnosCerradosOptimistas.includes(turnoAbierto.id),
  );
  const turno =
    turnosVigentes.find((turnoAbierto) =>
      turnoAbierto.modo === "POR_USUARIO"
        ? turnoAbierto.vendedor_id === userId
        : true,
    ) ?? null;
  const hayCajaAjenaAbierta = !turno && turnosVigentes.length > 0;

  const [, abrirAction, isAbrirPending] = useActionState(
    async (prevState: CajaActionState, formData: FormData) => {
      const res = await abrirTurnoAction(prevState, formData);
      if (res.success) {
        toast.success("Caja abierta correctamente.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
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
        setTurnosCerradosOptimistas((currentTurnos) =>
          Array.from(
            new Set([...currentTurnos, String(formData.get("turno_id") || "")]),
          ),
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
      return res;
    },
    { error: null, success: false },
  );

  const { movimientos, totales } = useMemo(() => {
    if (!turno) {
      return {
        movimientos: [] as MovimientoExtendido[],
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
    }

    const ventasMapeadas: MovimientoExtendido[] = ventas.flatMap((v) => {
      const pagos = v.venta_pagos || [];
      const primerItem = v.ventas_items?.[0];
      const primerProducto = getSupabaseRelation(primerItem?.producto);
      const vendedor = getSupabaseRelation(v.perfiles);
      const conceptoVenta = `Venta: ${primerProducto?.nombre || "Varios"}`;

      if (pagos.length > 0) {
        return pagos.map((pago) => ({
          id: `${v.id}-${pago.id || Math.random()}`,
          tipo: "INGRESO",
          origen: "VENTA",
          concepto: conceptoVenta,
          metodo: pago.metodo_nombre,
          metodo_tipo: pago.metodo_tipo,
          monto: Number(pago.monto_bruto),
          comision: Number(pago.comision_monto),
          neto: Number(pago.monto_neto),
          fecha: v.fecha_venta,
          usuario: vendedor?.nombre || "Vendedor",
        }));
      }

      const isEfectivo = v.metodo_pago === "EFECTIVO";
      return [
        {
          id: v.id,
          tipo: "INGRESO",
          origen: "VENTA",
          concepto: conceptoVenta,
          metodo: v.metodo_pago || "EFECTIVO",
          metodo_tipo: isEfectivo ? "EFECTIVO" : "TARJETA",
          monto: Number(v.total),
          comision: 0,
          neto: Number(v.total),
          fecha: v.fecha_venta,
          usuario: vendedor?.nombre || "Vendedor",
        },
      ];
    });

    const pagosSueltosMapeados: MovimientoExtendido[] = pagosSueltos.map(
      (p) => {
        const cliente = getSupabaseRelation(p.clientes);

        return {
          id: p.id ?? `${p.metodo_nombre}-${p.creado_en}`,
          tipo: "INGRESO",
          origen: "COBRO_DEUDA",
          concepto: `Cobro a Deudor: ${cliente?.nombre || "Cliente"}`,
          metodo: p.metodo_nombre,
          metodo_tipo: p.metodo_tipo,
          monto: Number(p.monto_bruto),
          comision: Number(p.comision_monto),
          neto: Number(p.monto_neto),
          fecha: p.creado_en || new Date().toISOString(),
          usuario: "Sistema",
        };
      },
    );

    const egresosMapeados: MovimientoExtendido[] = egresos.map((e) => ({
      id: e.id,
      tipo: "EGRESO",
      origen: "EGRESO",
      concepto: `Gasto: ${e.concepto}`,
      metodo: "CAJA FISICA",
      metodo_tipo: "EFECTIVO",
      monto: Number(e.monto),
      comision: 0,
      neto: Number(e.monto),
      fecha: e.fecha,
      usuario: e.perfiles?.nombre || "Usuario",
    }));

    const todos = [
      ...ventasMapeadas,
      ...pagosSueltosMapeados,
      ...egresosMapeados,
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const ingresosEfectivo = todos
      .filter((m) => m.tipo === "INGRESO" && m.metodo_tipo === "EFECTIVO")
      .reduce((acc, m) => acc + m.monto, 0);

    const digitales = todos.filter(
      (m) => m.tipo === "INGRESO" && m.metodo_tipo !== "EFECTIVO",
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
    const efectivoEsperado = fondoInicial + ingresosEfectivo - totalEgresos;

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
  }, [ventas, pagosSueltos, egresos, turno]);

  return (
    <div className="space-y-6 animate-in fade-in-50 px-4 p-2">
      {!turno ? (
        <Card className="border-border bg-background shadow-none overflow-hidden rounded-2xl">
          <div className="flex flex-col md:flex-row">
            <div className="p-6 md:px-10 md:w-1/2 flex flex-col justify-center">
              <div className="w-12 h-12 bg-primary/5 text-primary border border-primary/30 rounded-xl flex items-center justify-center mb-5">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-3 tracking-tight">
                {hayCajaAjenaAbierta
                  ? "No tenes una caja abierta"
                  : "La caja esta cerrada"}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {hayCajaAjenaAbierta
                  ? "Hay otras cajas abiertas en el local, pero no tenes un turno propio. Antes de registrar ventas o movimientos de dinero, inicia tu turno declarando el efectivo inicial."
                  : "Antes de comenzar a registrar ventas o movimientos de dinero, debes iniciar un nuevo turno de caja declarando el efectivo inicial."}
              </p>
            </div>
            <div className="p-6 md:p-10 md:w-1/2 border-t md:border-t-0 md:border-l border-border bg-card flex flex-col justify-center">
              <form action={abrirAction} className="space-y-6">
                <div className="space-y-3">
                  <Label
                    htmlFor="monto_inicial"
                    className="text-sm font-semibold text-foreground uppercase tracking-widest"
                  >
                    Fondo Inicial
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
                      className="pl-9 text-lg font-bold h-12 shadow-none rounded-xl border-border hover:border-foreground/40 transition-colors bg-card focus-visible:bg-background"
                      placeholder="Ej: 5000"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Monto de cambio (billetes/monedas) en el cajon.
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
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 sm:p-5 rounded-2xl border border-border">
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full items-center justify-center border border-emerald-100">
                <Unlock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-semibold uppercase text-foreogrund">
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
                  <Button className="text-white sm:w-auto">
                    <Lock className="w-4 h-4 mr-2" /> Cierre Z
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden border-border shadow-2xl">
                  <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-xl font-bold">
                      Cierre de Caja
                    </DialogTitle>
                  </DialogHeader>

                  <div className="px-6 py-4">
                    <div className="bg-card p-5 rounded-xl border border-border/50 space-y-3">
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
                          Cobros
                        </span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          +{formatearMoneda(totales.ingresosEfectivo)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">
                          Gastos
                        </span>
                        <span className="font-semibold text-rose-600">
                          -{formatearMoneda(totales.totalEgresos)}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold text-base pt-3 border-t border-border mt-1">
                        <span className="text-foreground">
                          Efectivo Esperado
                        </span>
                        <span
                          className={
                            totales.efectivoEsperado < 0
                              ? "text-rose-600"
                              : "text-emerald-700 dark:text-emerald-400"
                          }
                        >
                          {formatearMoneda(totales.efectivoEsperado)}
                        </span>
                      </div>
                      {totales.efectivoEsperado < 0 && (
                        <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5 pt-1">
                          <Info className="w-3.5 h-3.5 shrink-0" />
                          Revisar: el efectivo esperado dio negativo. Puede
                          haber egresos mal atribuidos a este turno.
                        </p>
                      )}
                    </div>
                  </div>

                  <form action={cerrarAction} className="px-6 pb-6 space-y-5">
                    <input type="hidden" name="turno_id" value={turno.id} />
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                        Efectivo real en cajon
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
                        <Info className="w-3 h-3" /> El sistema calculara
                        diferencias
                      </p>
                    </div>
                    <Button
                      type="submit"
                      disabled={isCerrarPending}
                      className="w-full h-12"
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-2xl border border-border bg-muted flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                  <Banknote className="w-4 h-4 text-emerald-500" />
                  Efectivo en Cajon
                </h3>
                <div
                  className={`text-3xl font-bold mb-2 ${
                    totales.efectivoEsperado < 0
                      ? "text-rose-600"
                      : "text-foreground"
                  }`}
                >
                  {formatearMoneda(totales.efectivoEsperado)}
                </div>
                {totales.efectivoEsperado < 0 ? (
                  <p className="text-sm text-rose-700 dark:text-rose-500">
                    Revisar: efectivo esperado negativo
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground font-medium">
                    Efectivo total esperado al cierre
                  </p>
                )}
              </div>
              <div className="mt-8 space-y-3">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">Fondo inicial</span>
                  <span className="font-semibold">
                    {formatearMoneda(totales.fondoInicial)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">
                    Cobros en efectivo
                  </span>
                  <span className="font-semibold text-emerald-600">
                    +{formatearMoneda(totales.ingresosEfectivo)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">Gastos fisicos</span>
                  <span className="font-semibold text-rose-600">
                    -{formatearMoneda(totales.totalEgresos)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-border bg-muted flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                  <CreditCard className="w-4 h-4 text-accent-blue" />
                  Cobros Digitales
                </h3>
                <div className="text-3xl font-bold text-foreground mb-2">
                  {formatearMoneda(totales.ingresosDigitalesNeto)}
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  Acreditacion neta estimada (Transf. y Tarjetas)
                </p>
              </div>
              <div className="mt-8 space-y-2">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">Cobros brutos</span>
                  <span className="font-semibold">
                    {formatearMoneda(totales.ingresosDigitalesBruto)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">
                    Comisiones retenidas
                  </span>
                  <span className="font-semibold text-rose-600">
                    -{formatearMoneda(totales.comisionesRetenidas)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="px-4 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-foreground">
                Movimientos del Turno
              </h3>
              <div className="text-sm font-medium text-muted-foreground">
                Total Facturado Bruto:{" "}
                <span className="text-foreground font-bold">
                  {formatearMoneda(totales.totalFacturado)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-card border border-border overflow-hidden">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-card text-muted-foreground text-[10px] uppercase font-bold tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Hora</th>
                    <th className="px-6 py-4">Concepto</th>
                    <th className="px-6 py-4">Metodo</th>
                    <th className="px-6 py-4 text-right">Monto</th>
                    <th className="px-6 py-4 hidden sm:table-cell">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {movimientos.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-muted-foreground bg-transparent"
                      >
                        Aun no hay movimientos registrados en este turno.
                      </td>
                    </tr>
                  ) : (
                    movimientos.map((mov) => (
                      <tr
                        key={`${mov.tipo}-${mov.id}`}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4 text-muted-foreground text-xs font-medium">
                          {new Date(mov.fecha).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-6 py-4 font-medium text-foreground">
                          <div className="flex items-center gap-3">
                            {mov.origen === "VENTA" && (
                              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-300/20 text-emerald-700 dark:text-emerald-300 rounded-md shrink-0 border">
                                <ShoppingBag className="w-3.5 h-3.5" />
                              </div>
                            )}
                            {mov.origen === "COBRO_DEUDA" && (
                              <div className="p-1.5 bg-indigo-50 dark:bg-indigo-300/20 text-indigo-700 dark:text-indigo-300 rounded-md shrink-0 border">
                                <BookUser className="w-3.5 h-3.5" />
                              </div>
                            )}
                            {mov.origen === "EGRESO" && (
                              <div className="p-1.5 bg-rose-50 dark:bg-rose-300/20 text-rose-700 dark:text-rose-300 rounded-md shrink-0 border">
                                <TrendingDown className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <span className="truncate max-w-[150px] sm:max-w-xs text-xs sm:text-sm">
                              {mov.concepto}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase shadow-none bg-muted"
                          >
                            {mov.metodo}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div
                            className={
                              mov.tipo === "INGRESO"
                                ? "text-emerald-700 dark:text-emerald-500"
                                : "text-rose-700 dark:text-rose-500"
                            }
                          >
                            {mov.tipo === "INGRESO" ? "+" : "-"}
                            {formatearMoneda(mov.monto)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground hidden sm:table-cell text-xs">
                          {mov.usuario}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <CajaHistoryTable historial={historial} />
    </div>
  );
}
