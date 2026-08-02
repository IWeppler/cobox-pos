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
import { useCajaStatusStore } from "@/shared/store/caja-status-store";
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
  historial: _historial,
  modoCaja: _modoCaja,
  userRole: _userRole,
  userId,
}: Readonly<CajaDashboardProps>) {
  const router = useRouter();
  const notifyCajaChanged = useCajaStatusStore(
    (state) => state.notifyCajaChanged,
  );
  const [isCerrarOpen, setIsCerrarOpen] = useState(false);
  const [turnosCerradosOptimistas, setTurnosCerradosOptimistas] = useState<
    string[]
  >([]);
  void _modoCaja;
  void _userRole;
  void _historial;

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
        notifyCajaChanged();
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
        notifyCajaChanged();
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
        /* Versión compacta del formulario de apertura. Antes era un banner a
           media pantalla; el mismo formulario vive ahora también en el botón
           de caja del navbar (CajaQuickModal), así que acá alcanza con una
           barra al tono del resto de la página. */
        <Card className="border-border bg-card shadow-none rounded-2xl p-4 sm:p-5">
          <form
            action={abrirAction}
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 bg-muted text-muted-foreground border border-border rounded-lg flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {hayCajaAjenaAbierta
                    ? "No tenés un turno propio abierto"
                    : "La caja está cerrada"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hayCajaAjenaAbierta
                    ? "Hay otras cajas abiertas en el local. Declará tu fondo inicial para empezar."
                    : "Declará el efectivo inicial del cajón para empezar a vender."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Label htmlFor="monto_inicial" className="sr-only">
                Fondo inicial
              </Label>
              <div className="relative flex-1 sm:flex-none">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                  $
                </span>
                <Input
                  id="monto_inicial"
                  name="monto_inicial"
                  type="number"
                  min="0"
                  required
                  className="pl-8 h-10 w-full sm:w-36 font-mono shadow-none rounded-xl border-border hover:border-foreground/40 transition-colors bg-background"
                  placeholder="Fondo inicial"
                />
              </div>
              <Button
                type="submit"
                disabled={isAbrirPending}
                className="h-10 rounded-xl shadow-none cursor-pointer shrink-0"
              >
                {isAbrirPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Unlock className="w-4 h-4 mr-2" />
                )}
                Abrir turno
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 sm:p-5 rounded-2xl border border-border">
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex w-10 h-10 bg-success/10 text-success rounded-full items-center justify-center border border-success/20">
                <Unlock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                  </span>
                  <span className="text-sm font-semibold uppercase text-foreground">
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
                        <span className="font-mono font-medium text-foreground">
                          {formatearMoneda(totales.fondoInicial)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">
                          Cobros
                        </span>
                        <span className="font-mono font-medium text-success">
                          +{formatearMoneda(totales.ingresosEfectivo)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">
                          Gastos
                        </span>
                        <span className="font-mono font-medium text-danger">
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
                              ? "font-mono font-medium text-danger"
                              : "font-mono font-medium text-success"
                          }
                        >
                          {formatearMoneda(totales.efectivoEsperado)}
                        </span>
                      </div>
                      {totales.efectivoEsperado < 0 && (
                        <p className="text-xs text-danger font-semibold flex items-center gap-1.5 pt-1">
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
                      <Label className="text-sm font-semibold uppercase text-muted-foreground">
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
                          className="pl-9 font-mono font-medium h-12 text-xl rounded-xl border-border/60 hover:border-foreground/40 focus-visible:border-foreground bg-background"
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
                  <Banknote className="w-4 h-4 text-success" />
                  Efectivo en Cajon
                </h3>
                <div
                  className={`text-3xl font-mono font-semibold mb-2 ${
                    totales.efectivoEsperado < 0
                      ? "text-danger"
                      : "text-foreground"
                  }`}
                >
                  {formatearMoneda(totales.efectivoEsperado)}
                </div>
                {totales.efectivoEsperado < 0 ? (
                  <p className="text-sm text-danger">
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
                  <span className="font-mono font-medium">
                    {formatearMoneda(totales.fondoInicial)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">
                    Cobros en efectivo
                  </span>
                  <span className="font-mono font-medium text-success">
                    +{formatearMoneda(totales.ingresosEfectivo)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">Gastos fisicos</span>
                  <span className="font-mono font-medium text-danger">
                    -{formatearMoneda(totales.totalEgresos)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-border bg-muted flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                  <CreditCard className="w-4 h-4 text-chart-1" />
                  Cobros Digitales
                </h3>
                <div className="text-3xl font-mono font-semibold text-foreground mb-2">
                  {formatearMoneda(totales.ingresosDigitalesNeto)}
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  Acreditacion neta estimada (Transf. y Tarjetas)
                </p>
              </div>
              <div className="mt-8 space-y-2">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">Cobros brutos</span>
                  <span className="font-mono font-medium">
                    {formatearMoneda(totales.ingresosDigitalesBruto)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-muted-foreground">
                    Comisiones retenidas
                  </span>
                  <span className="font-mono font-medium text-danger">
                    -{formatearMoneda(totales.comisionesRetenidas)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="px-4 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-foreground">
                Movimientos del Turno
              </h3>
              <div className="text-sm font-medium text-muted-foreground">
                Total Facturado Bruto:{" "}
                <span className="text-foreground font-mono font-medium">
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
                              <div className="p-1.5 bg-success/10 text-success rounded-md shrink-0 border">
                                <ShoppingBag className="w-3.5 h-3.5" />
                              </div>
                            )}
                            {mov.origen === "COBRO_DEUDA" && (
                              <div className="p-1.5 bg-info/10 text-info rounded-md shrink-0 border">
                                <BookUser className="w-3.5 h-3.5" />
                              </div>
                            )}
                            {mov.origen === "EGRESO" && (
                              <div className="p-1.5 bg-danger/10 text-danger rounded-md shrink-0 border">
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
                        <td className="px-6 py-4 text-right font-mono font-medium">
                          <div
                            className={
                              mov.tipo === "INGRESO"
                                ? "text-success"
                                : "text-danger"
                            }
                          >
                            {mov.tipo === "INGRESO" ? "+" : "-"}
                            {formatearMoneda(mov.monto)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground hidden sm:table-cell text-sm">
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

      {/* El historial se renderiza afuera (page.tsx): tiene que verse también
          cuando la dueña está en "Vista general" y este componente no se
          monta. */}
    </div>
  );
}
