"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PackagePlus,
  Search,
} from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type { MovimientoStock } from "../actions/get-movimientos-stock";
import {
  ETIQUETA_ORIGEN,
  agruparPorRemito,
  filtrarMovimientos,
  paginar,
  resumirMovimientos,
  type FiltrosMovimientos,
  type OrigenMovimiento,
} from "../lib/agrupar-movimientos";

type Vista = "lista" | "remitos";

const ORIGENES: (OrigenMovimiento | "todos")[] = [
  "todos",
  "remito",
  "venta",
  "devolucion",
  "baja",
  "ajuste",
];

function formatearFecha(fecha: string) {
  return new Date(fecha).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Movimientos de stock: la lista completa y la vista por remito.
 *
 * Son dos preguntas distintas sobre los mismos datos, y por eso son dos
 * pestañas y no dos pantallas: "qué le pasó a este producto" se responde en la
 * lista, y "qué trajo este remito" en la agrupada. Un remito de 347 líneas en
 * la lista plana son 347 filas seguidas que tapan todo el resto del día.
 *
 * Filtrar y paginar pasa en memoria: la página ya trajo el período completo
 * del server, y a este volumen una ida al server por tecla tipeada es peor.
 */
export function MovimientosTable({
  movimientos,
}: Readonly<{ movimientos: MovimientoStock[] }>) {
  const [vista, setVista] = useState<Vista>("lista");
  const [pagina, setPagina] = useState(1);
  const [remitoAbierto, setRemitoAbierto] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosMovimientos>({
    busqueda: "",
    tipo: "todos",
    origen: "todos",
  });

  /** Cualquier cambio de filtro vuelve a la página 1: quedarse en la 4 con un
   * resultado de una sola página es la forma más rápida de creer que no hay
   * nada. */
  const cambiarFiltro = (parcial: Partial<FiltrosMovimientos>) => {
    setFiltros((previo) => ({ ...previo, ...parcial }));
    setPagina(1);
  };

  const filtrados = useMemo(
    () => filtrarMovimientos(movimientos, filtros),
    [movimientos, filtros],
  );
  const resumen = useMemo(() => resumirMovimientos(filtrados), [filtrados]);
  const remitos = useMemo(() => agruparPorRemito(filtrados), [filtrados]);

  const paginaLista = paginar(filtrados, pagina);
  const paginaRemitos = paginar(remitos, pagina, 20);
  const actual = vista === "lista" ? paginaLista : paginaRemitos;

  return (
    <div className="space-y-4">
      {/* Resumen del período filtrado. Va arriba porque "cuánto entró y cuánto
          salió" es lo primero que se mira, y estaba solo implícito en la
          lista. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Resumen
          titulo="Ingresos"
          valor={`+${resumen.ingresos}`}
          className="text-success"
        />
        <Resumen
          titulo="Egresos"
          valor={`-${resumen.egresos}`}
          className="text-danger"
        />
        <Resumen
          titulo="Neto"
          valor={`${resumen.neto >= 0 ? "+" : ""}${resumen.neto}`}
          className={resumen.neto >= 0 ? "text-foreground" : "text-danger"}
        />
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card p-2 sm:p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto, proveedor o persona..."
              className="h-10 w-full rounded-lg border-border bg-muted pl-9 text-sm"
              value={filtros.busqueda}
              onChange={(e) => cambiarFiltro({ busqueda: e.target.value })}
            />
          </div>

          <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1">
            <BotonVista
              activo={vista === "lista"}
              onClick={() => {
                setVista("lista");
                setPagina(1);
              }}
            >
              Todos
            </BotonVista>
            <BotonVista
              activo={vista === "remitos"}
              onClick={() => {
                setVista("remitos");
                setPagina(1);
              }}
            >
              <PackagePlus className="mr-1.5 size-3.5" />
              Por remito ({remitos.length})
            </BotonVista>
          </div>
        </div>

        {/* Los filtros de tipo y origen solo aplican a la lista: en la vista
            por remito son todos ingresos del mismo origen. */}
        {vista === "lista" && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Pill
              activo={filtros.tipo === "todos" && filtros.origen === "todos"}
              onClick={() => cambiarFiltro({ tipo: "todos", origen: "todos" })}
            >
              Todo
            </Pill>
            <Pill
              activo={filtros.tipo === "INGRESO"}
              onClick={() => cambiarFiltro({ tipo: "INGRESO" })}
            >
              Ingresos
            </Pill>
            <Pill
              activo={filtros.tipo === "EGRESO"}
              onClick={() => cambiarFiltro({ tipo: "EGRESO" })}
            >
              Egresos
            </Pill>

            <span className="mx-1 w-px shrink-0 bg-border" />

            {ORIGENES.filter((o) => o !== "todos").map((origen) => (
              <Pill
                key={origen}
                activo={filtros.origen === origen}
                onClick={() =>
                  cambiarFiltro({
                    origen: filtros.origen === origen ? "todos" : origen,
                  })
                }
              >
                {ETIQUETA_ORIGEN[origen as OrigenMovimiento]}
              </Pill>
            ))}
          </div>
        )}
      </div>

      {actual.total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          {movimientos.length === 0
            ? "No hay movimientos de stock en este período."
            : "Ningún movimiento coincide con el filtro."}
        </div>
      ) : vista === "lista" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="w-full overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginaLista.filas.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatearFecha(m.fecha)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {m.producto}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({m.variante})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TipoBadge tipo={m.tipo} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      <Cantidad tipo={m.tipo} cantidad={m.cantidad} />
                    </td>
                    <td className="max-w-70 truncate px-4 py-3 text-muted-foreground">
                      {m.origen}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.usuario ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {paginaRemitos.filas.map((remito) => {
            const abierto = remitoAbierto === remito.remitoId;
            return (
              <div
                key={remito.remitoId}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() =>
                    setRemitoAbierto(abierto ? null : remito.remitoId)
                  }
                  aria-expanded={abierto}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <PackagePlus className="size-4 text-success" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{remito.proveedor}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatearFecha(remito.fecha)}
                    </p>
                  </div>

                  <div className="hidden shrink-0 gap-6 text-right sm:flex">
                    <Metrica valor={remito.productos} etiqueta="productos" />
                    <Metrica valor={remito.lineas} etiqueta="líneas" />
                    <Metrica
                      valor={`+${remito.unidades}`}
                      etiqueta="unidades"
                      className="text-success"
                    />
                  </div>

                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      abierto ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {abierto && (
                  <div className="border-t border-border">
                    {/* Solo en mobile: arriba las métricas no entran. */}
                    <div className="flex gap-6 border-b border-border/50 px-4 py-2 sm:hidden">
                      <Metrica valor={remito.productos} etiqueta="productos" />
                      <Metrica valor={remito.lineas} etiqueta="líneas" />
                      <Metrica
                        valor={`+${remito.unidades}`}
                        etiqueta="unidades"
                        className="text-success"
                      />
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className="w-full whitespace-nowrap text-left text-sm">
                        <thead className="bg-muted/40 text-xs font-bold uppercase text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2">Producto</th>
                            <th className="px-4 py-2">Variante</th>
                            <th className="px-4 py-2 text-right">Cantidad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {remito.items.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/20">
                              <td className="px-4 py-2 font-medium">
                                {item.producto}
                              </td>
                              <td className="px-4 py-2 text-muted-foreground">
                                {item.variante}
                              </td>
                              <td className="px-4 py-2 text-right font-bold text-success">
                                +{item.cantidad}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {actual.total > 0 && actual.totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs text-muted-foreground">
            {actual.desde}–{actual.hasta} de {actual.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              disabled={actual.pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeft className="size-3.5" />
              Anterior
            </Button>
            <span className="min-w-16 text-center text-xs font-medium text-muted-foreground">
              {actual.pagina} / {actual.totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              disabled={actual.pagina === actual.totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Resumen({
  titulo,
  valor,
  className = "",
}: Readonly<{ titulo: string; valor: string; className?: string }>) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${className}`}>
        {valor}
      </p>
    </div>
  );
}

function Metrica({
  valor,
  etiqueta,
  className = "",
}: Readonly<{ valor: number | string; etiqueta: string; className?: string }>) {
  return (
    <div>
      <p className={`font-mono text-sm font-bold tabular-nums ${className}`}>
        {valor}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </p>
    </div>
  );
}

function TipoBadge({ tipo }: Readonly<{ tipo: "INGRESO" | "EGRESO" }>) {
  return tipo === "INGRESO" ? (
    <Badge variant="success">
      <ArrowUpCircle className="mr-1 h-3 w-3" /> Ingreso
    </Badge>
  ) : (
    <Badge variant="danger">
      <ArrowDownCircle className="mr-1 h-3 w-3" /> Egreso
    </Badge>
  );
}

function Cantidad({
  tipo,
  cantidad,
}: Readonly<{ tipo: "INGRESO" | "EGRESO"; cantidad: number }>) {
  return (
    <span className={tipo === "INGRESO" ? "text-success" : "text-danger"}>
      {tipo === "INGRESO" ? "+" : "-"}
      {cantidad}
    </span>
  );
}

function BotonVista({
  activo,
  onClick,
  children,
}: Readonly<{
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center rounded-md px-3 text-xs font-semibold transition-colors ${
        activo
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Pill({
  activo,
  onClick,
  children,
}: Readonly<{
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors ${
        activo
          ? "border-transparent bg-foreground text-background"
          : "border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
