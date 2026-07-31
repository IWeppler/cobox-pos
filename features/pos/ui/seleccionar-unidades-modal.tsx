"use client";

import { useCallback, useEffect, useState } from "react";
import { Barcode, Loader2, ScanLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { getUnidadesDisponiblesAction } from "@/features/sales/actions/get-unidades-serie";
import type {
  UnidadSeleccionada,
  UnidadSerieDisponible,
} from "@/entities/ventas/unidades-serie-types";

/** Línea del carrito que no se puede vender sin elegir el aparato. */
export interface LineaSerializada {
  varianteId: string;
  nombre: string;
  variante: string;
}

interface SeleccionarUnidadesModalProps {
  /** El componente se monta solo cuando hay que elegir: no recibe `open`. */
  onCerrar: () => void;
  lineas: LineaSerializada[];
  /** Se llama con una unidad por línea, en el mismo orden. */
  onConfirmar: (seleccion: UnidadSeleccionada[]) => void;
}

/**
 * Selección del aparato físico para las líneas serializadas del carrito.
 *
 * Solo lista unidades `estado = 'disponible'`, ordenadas por fecha_ingreso
 * ascendente (FIFO: primero sale el que primero entró, que es lo que evita
 * que queden equipos viejos muertos en el fondo del stock).
 *
 * Elegir acá no reserva nada: la unidad se marca recién al confirmar la
 * venta, con un UPDATE condicional que rebota si otra caja la vendió en el
 * medio. Por eso el modal puede mostrar una unidad que para cuando se
 * confirme ya no esté — el error de esa carrera se ve al confirmar, no acá.
 */
export function SeleccionarUnidadesModal({
  onCerrar,
  lineas,
  onConfirmar,
}: Readonly<SeleccionarUnidadesModalProps>) {
  // Arranca en true: el componente se monta justo para cargar, así el
  // primer setState ya es el de la respuesta y no hay reset síncrono.
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unidadesPorVariante, setUnidadesPorVariante] = useState<
    Record<string, UnidadSerieDisponible[]>
  >({});
  const [elegidaPorVariante, setElegidaPorVariante] = useState<
    Record<string, string>
  >({});
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    try {
      const entradas = await Promise.all(
        lineas.map(async (linea) => {
          const res = await getUnidadesDisponiblesAction(linea.varianteId);
          return [linea.varianteId, res.unidades, res.error] as const;
        }),
      );

      const mapa: Record<string, UnidadSerieDisponible[]> = {};
      let primerError: string | null = null;
      for (const [varianteId, unidades, err] of entradas) {
        mapa[varianteId] = unidades;
        if (err && !primerError) primerError = err;
      }

      setUnidadesPorVariante(mapa);
      setError(primerError);

      // Preselección FIFO: la primera disponible de cada línea. Es lo que
      // el vendedor elige en el 90% de los casos y ahorra un clic por
      // aparato; sigue pudiendo cambiarla si el cliente pide otro.
      setElegidaPorVariante((previo) => {
        const siguiente = { ...previo };
        for (const [varianteId, unidades] of Object.entries(mapa)) {
          if (!siguiente[varianteId] && unidades.length > 0) {
            siguiente[varianteId] = unidades[0].id;
          }
        }
        return siguiente;
      });
    } finally {
      setCargando(false);
    }
  }, [lineas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const todasElegidas = lineas.every((l) => elegidaPorVariante[l.varianteId]);

  const handleConfirmar = () => {
    const seleccion: UnidadSeleccionada[] = [];
    for (const linea of lineas) {
      const unidadId = elegidaPorVariante[linea.varianteId];
      const unidad = unidadesPorVariante[linea.varianteId]?.find(
        (u) => u.id === unidadId,
      );
      if (!unidad) return;
      seleccion.push({
        varianteId: linea.varianteId,
        unidadId: unidad.id,
        imei: unidad.imei,
      });
    }
    onConfirmar(seleccion);
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-[600px] border-border bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-emerald-600" />
            Elegí el aparato
          </DialogTitle>
          <DialogDescription>
            Estos productos se venden por número de serie. Seleccioná qué
            unidad se lleva el cliente.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Buscando unidades disponibles...
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {error && (
              <p className="text-xs text-red-600 border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Escaneá o tipeá un IMEI para filtrar"
                className="pl-9"
              />
            </div>

            {lineas.map((linea) => {
              const unidades = unidadesPorVariante[linea.varianteId] ?? [];
              const filtradas = filtro.trim()
                ? unidades.filter((u) =>
                    u.imei.toLowerCase().includes(filtro.trim().toLowerCase()),
                  )
                : unidades;

              return (
                <div
                  key={linea.varianteId}
                  className="border border-border rounded-xl overflow-hidden"
                >
                  <div className="bg-muted/40 px-3 py-2">
                    <div className="text-sm font-semibold">{linea.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {linea.variante}
                    </div>
                  </div>

                  {unidades.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-red-600">
                      No quedan unidades disponibles de este producto. Sacalo
                      del carrito para poder cobrar.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto divide-y divide-border">
                      {filtradas.length === 0 && (
                        <p className="px-3 py-3 text-xs text-muted-foreground">
                          Ningún IMEI de este producto coincide con el filtro.
                        </p>
                      )}
                      {filtradas.map((unidad, idx) => {
                        const elegida =
                          elegidaPorVariante[linea.varianteId] === unidad.id;
                        return (
                          <button
                            key={unidad.id}
                            type="button"
                            onClick={() =>
                              setElegidaPorVariante((previo) => ({
                                ...previo,
                                [linea.varianteId]: unidad.id,
                              }))
                            }
                            className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition-colors ${
                              elegida
                                ? "bg-emerald-50 dark:bg-emerald-950/30"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <span className="font-mono text-xs">
                              {unidad.imei}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              {/* El primero de la lista es el más viejo: es
                                  el que conviene sacar primero. */}
                              {idx === 0 && !filtro.trim() && (
                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                  Más antiguo
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold uppercase tracking-widest ${
                                  elegida
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-transparent"
                                }`}
                              >
                                Elegido
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={onCerrar}
                className="shadow-none"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmar}
                disabled={!todasElegidas}
                className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-none"
              >
                Confirmar unidades
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
