"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  BookUser,
  ChevronDown,
  Clock,
  CreditCard,
  Landmark,
  Wallet,
} from "lucide-react";
import { formatearMoneda } from "@/shared/utils/formatters";
import type {
  DetalleMedioPago,
  ResumenGerencialCaja,
} from "@/entities/caja/types";

interface VistaGerencialProps {
  resumen: ResumenGerencialCaja;
  detalle: DetalleMedioPago[];
}

/** Label e ícono por tipo de medio. `metodo_tipo` no es una unión cerrada: la
 * RPC deja pasar tipos que existen en datos viejos (BILLETERA_VIRTUAL) y
 * cualquiera que se cree después, así que hay fallback en vez de undefined.
 *
 * TARJETA es UNA sola fila: hoy `metodos_pago.tipo` no distingue crédito de
 * débito. Mostrar dos filas separadas sería inventar una plata que la base no
 * tiene diferenciada. */
const MEDIOS: Record<string, { label: string; Icono: typeof Banknote }> = {
  EFECTIVO: { label: "Efectivo", Icono: Banknote },
  TRANSFERENCIA: { label: "Transferencias", Icono: Landmark },
  TARJETA: { label: "Tarjetas", Icono: CreditCard },
  BILLETERA_VIRTUAL: { label: "Billetera virtual", Icono: Wallet },
};

function medioLabel(tipo: string) {
  if (MEDIOS[tipo]) return MEDIOS[tipo].label;
  // Un tipo nuevo se muestra legible ("MERCADO_PAGO" -> "Mercado pago") en vez
  // de gritado en mayúsculas con guiones bajos.
  const limpio = tipo.replace(/_/g, " ").toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function medioIcono(tipo: string) {
  return MEDIOS[tipo]?.Icono ?? Wallet;
}

const LABEL =
  "text-[10px] uppercase tracking-widest text-muted-foreground font-bold";

export function VistaGerencial({
  resumen,
  detalle,
}: Readonly<VistaGerencialProps>) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const { caja, ventas, cuenta_corriente: cc } = resumen;
  const turnosCerrados = caja.turnos_totales - caja.turnos_abiertos;
  const hayFiado = cc.fiado_otorgado > 0;

  const detallePorTipo = useMemo(() => {
    const mapa = new Map<string, DetalleMedioPago[]>();
    for (const fila of detalle) {
      const actual = mapa.get(fila.metodo_tipo);
      if (actual) actual.push(fila);
      else mapa.set(fila.metodo_tipo, [fila]);
    }
    return mapa;
  }, [detalle]);

  const toggle = (tipo: string) => {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(tipo)) siguiente.delete(tipo);
      else siguiente.add(tipo);
      return siguiente;
    });
  };

  return (
    <div className="space-y-6 flex flex-col-reverse lg:flex-row lg:items-start lg:gap-6">
      {/* ===================== CARD "HOY" ===================== */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className={LABEL}>Hoy</h3>
            <div className="text-3xl font-mono font-semibold text-foreground mt-2">
              {formatearMoneda(ventas.total_cobrado)}
            </div>
            <p className="text-sm text-muted-foreground font-medium mt-1">
              {ventas.cantidad_ventas === 1
                ? "1 venta cobrada"
                : `${ventas.cantidad_ventas} ventas cobradas`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground shrink-0">
            <Clock className="w-3.5 h-3.5" />
            {caja.turnos_totales === 0
              ? "Sin turnos"
              : `${turnosCerrados}/${caja.turnos_totales} turnos cerrados`}
          </div>
        </div>

        {/* Fiado: fila aparte y explícita. Es lo que se vendió y NO entró, así
            que sumarlo arriba haría leer como cobrado algo que es deuda. */}
        {hayFiado && (
          <div className="mx-6 mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-indigo-50 dark:bg-indigo-300/20 text-indigo-700 dark:text-indigo-300 rounded-md shrink-0 border">
                <BookUser className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Fiado en cuenta corriente
                </p>
                <p className="text-xs text-muted-foreground">
                  No incluido en el total de arriba —{" "}
                  {cc.cantidad_ventas_con_fiado === 1
                    ? "1 venta"
                    : `${cc.cantidad_ventas_con_fiado} ventas`}
                </p>
              </div>
            </div>
            <span className="font-mono font-medium text-foreground shrink-0">
              {formatearMoneda(cc.fiado_otorgado)}
            </span>
          </div>
        )}

        <div className="border-t border-border" />

        {/* ---- Breakdown por medio (siempre en vivo) ---- */}
        <div className="px-6 py-4 space-y-3">
          {resumen.breakdown_medios.map((medio) => {
            const Icono = medioIcono(medio.tipo);
            return (
              <div
                key={medio.tipo}
                className="flex items-center justify-between gap-3 text-sm font-medium"
              >
                <span className="flex items-center gap-2 text-muted-foreground min-w-0">
                  <Icono className="w-4 h-4 shrink-0" />
                  <span className="truncate">{medioLabel(medio.tipo)}</span>
                </span>
                <span className="font-mono font-medium text-foreground shrink-0">
                  {formatearMoneda(medio.monto)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border" />

        {/* ---- Arqueo ---- */}
        <div className="px-6 py-4 bg-muted/40">
          <div className="flex items-center justify-between gap-3 text-sm font-medium">
            <span className="text-muted-foreground">Esperado en caja</span>
            <span className="font-mono font-medium text-foreground">
              {formatearMoneda(caja.esperado)}
            </span>
          </div>

          {caja.cierre_completo ? (
            <>
              <div className="flex items-center justify-between gap-3 text-sm font-medium mt-3">
                <span className="text-muted-foreground">Caja real</span>
                <span className="font-mono font-medium text-foreground">
                  {formatearMoneda(caja.real_declarado ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm font-semibold mt-3 pt-3 border-t border-border">
                <span className="text-foreground">Diferencia</span>
                <span
                  className={`font-mono font-semibold ${
                    (caja.diferencia ?? 0) === 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-rose-600"
                  }`}
                >
                  {/* El signo se escribe a mano: formatearMoneda ya trae el "-"
                      del negativo, pero un sobrante sin "+" se lee como faltante. */}
                  {(caja.diferencia ?? 0) > 0 && "+"}
                  {formatearMoneda(caja.diferencia ?? 0)}
                </span>
              </div>
            </>
          ) : (
            /* Con algún turno abierto NO se muestra Real ni Diferencia: el
               monto declarado de ese turno todavía no existe y la resta daría
               un faltante inventado. Esperado y breakdown sí, son en vivo. */
            <div className="mt-3 pt-3 border-t border-border flex items-start gap-2.5">
              <span className="relative flex h-2 w-2 mt-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {caja.turnos_totales === 0
                    ? "Sin turnos abiertos hoy"
                    : `${turnosCerrados} de ${caja.turnos_totales} turnos cerrados`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {caja.turnos_totales === 0
                    ? "El arqueo aparece cuando se abra y cierre el primer turno."
                    : "La caja real y la diferencia se calculan cuando cierren todos los turnos."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============ MOVIMIENTO POR MEDIO DE PAGO ============ */}
      <div className="flex-1 space-y-3">
        <h3 className="text-lg font-bold text-foreground px-1 mb-2">
          Movimiento por medio de pago
        </h3>

        <div className="rounded-2xl bg-card border border-border overflow-hidden divide-y divide-border/60">
          {resumen.breakdown_medios.map((medio) => {
            const filas = detallePorTipo.get(medio.tipo) ?? [];
            const abierto = expandidos.has(medio.tipo);
            const Icono = medioIcono(medio.tipo);

            return (
              <div key={medio.tipo}>
                <button
                  type="button"
                  onClick={() => toggle(medio.tipo)}
                  disabled={filas.length === 0}
                  aria-expanded={abierto}
                  className="w-full flex items-center gap-3 px-4 sm:px-6 py-4 text-left hover:bg-muted/30 transition-colors disabled:hover:bg-transparent disabled:cursor-default cursor-pointer"
                >
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
                      abierto ? "rotate-180" : ""
                    } ${filas.length === 0 ? "opacity-0" : ""}`}
                  />
                  <Icono className="w-4 h-4 shrink-0 text-muted-foreground" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {medioLabel(medio.tipo)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {medio.cantidad_ventas === 1
                        ? "1 venta"
                        : `${medio.cantidad_ventas} ventas`}
                      {/* Sin esta aclaración el monto no cierra contra las
                          ventas: parte es deuda vieja cobrada hoy. */}
                      {medio.monto_cobranzas_cc > 0 &&
                        ` · ${formatearMoneda(medio.monto_cobranzas_cc)} de cuenta corriente`}
                    </p>
                  </div>

                  <span className="font-mono font-medium text-foreground shrink-0">
                    {formatearMoneda(medio.monto)}
                  </span>
                </button>

                {abierto && filas.length > 0 && (
                  <div className="bg-muted/30 border-t border-border/60">
                    <table className="w-full text-sm text-left">
                      <thead className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest">
                        <tr>
                          <th className="px-4 sm:px-6 py-2.5 font-bold">Hora</th>
                          <th className="px-2 py-2.5 font-bold">Concepto</th>
                          <th className="px-2 py-2.5 font-bold hidden sm:table-cell">
                            Vendedora
                          </th>
                          <th className="px-4 sm:px-6 py-2.5 text-right font-bold">
                            Monto
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filas.map((fila) => (
                          <tr key={fila.pago_id}>
                            <td className="px-4 sm:px-6 py-2.5 text-muted-foreground text-xs font-mono whitespace-nowrap">
                              {new Date(fila.fecha).toLocaleTimeString("es-AR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-2 py-2.5 text-foreground">
                              <span className="truncate block max-w-[140px] sm:max-w-xs text-xs sm:text-sm">
                                {fila.es_cobranza_cc
                                  ? `Cobro de deuda${fila.cliente ? ` — ${fila.cliente}` : ""}`
                                  : (fila.cliente ?? fila.metodo_nombre.trim())}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">
                              {fila.vendedor ?? "—"}
                            </td>
                            <td className="px-4 sm:px-6 py-2.5 text-right font-mono font-medium text-foreground whitespace-nowrap">
                              {formatearMoneda(fila.monto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
