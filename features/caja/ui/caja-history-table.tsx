"use client";

import { useState, useMemo } from "react";
import { TurnoCajaHistorial } from "@/entities/caja/types";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  History,
  FileText,
} from "lucide-react";
import { CajaDetailSheet } from "./caja-detail-sheet";
import { formatearFechaHora, formatearMoneda } from "@/shared/utils/formatters";

interface CajaHistoryTableProps {
  historial: TurnoCajaHistorial[];
}

export function CajaHistoryTable({
  historial,
}: Readonly<CajaHistoryTableProps>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const ITEMS_POR_PAGINA = 10;
  const [turnoAbierto, setTurnoAbierto] = useState<TurnoCajaHistorial | null>(
    null,
  );

  const filteredData = useMemo(() => {
    return historial.filter((h) => {
      const idCorto = h.id.split("-")[0].toLowerCase();
      const vendedor = h.perfiles?.nombre?.toLowerCase() || "";
      const searchLower = searchQuery.toLowerCase().replace("#", "");

      return idCorto.includes(searchLower) || vendedor.includes(searchLower);
    });
  }, [historial, searchQuery]);

  const totalPaginas = Math.ceil(filteredData.length / ITEMS_POR_PAGINA);
  const paginatedData = filteredData.slice(
    (paginaActual - 1) * ITEMS_POR_PAGINA,
    paginaActual * ITEMS_POR_PAGINA,
  );

  return (
    <div className="mt-12 pt-8 border-t border-border">
      <CajaDetailSheet
        turno={turnoAbierto}
        onClose={() => setTurnoAbierto(null)}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          Historial de Cajas
        </h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID o Vendedor..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPaginaActual(1);
            }}
            className="pl-9 h-10 rounded-xl border-border bg-background shadow-none hover:border-foreground/40 transition-colors focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-muted-foreground text-[10px] uppercase font-bold tracking-widest">
              <tr>
                <th className="px-5 py-3 border-b border-border">ID Turno</th>
                <th className="px-5 py-3 border-b border-border">Apertura</th>
                <th className="px-5 py-3 border-b border-border hidden sm:table-cell">
                  Cierre
                </th>
                <th className="px-5 py-3 border-b border-border hidden md:table-cell">
                  Usuario
                </th>
                <th className="px-5 py-3 border-b border-border">Estado</th>
                <th className="px-5 py-3 text-right border-b border-border">
                  Diferencia
                </th>
                <th className="px-5 py-3 text-right border-b border-border">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-muted-foreground font-medium"
                  >
                    No se encontraron turnos que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                paginatedData.map((h) => {
                  const isAbierto = h.estado === "ABIERTO";
                  const idCorto = h.id.split("-")[0].toUpperCase();

                  return (
                    <tr
                      key={h.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-bold text-muted-foreground whitespace-nowrap text-xs">
                        #{idCorto}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-foreground whitespace-nowrap">
                        {formatearFechaHora(h.fecha_apertura)}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                        {isAbierto ? "-" : formatearFechaHora(h.fecha_cierre)}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">
                        {h.perfiles?.nombre || "Vendedor"}
                      </td>
                      <td className="px-5 py-3.5">
                        {isAbierto ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50/50 dark:bg-emerald-300/20 text-emerald-700 dark:text-emerald-300 text-[10px] shadow-none uppercase"
                          >
                            ABIERTO
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-background text-muted-foreground border-border text-[10px] shadow-none uppercase"
                          >
                            CERRADO
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {isAbierto
                          ? "-"
                          : (() => {
                              if (
                                h.efectivo_esperado == null ||
                                h.efectivo_esperado === ""
                              )
                                return (
                                  <span className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold">
                                    S/D
                                  </span>
                                );

                              const final = Number(h.monto_final || 0);
                              const esperado = Number(h.efectivo_esperado);
                              const diferencia = final - esperado;

                              if (esperado < 0) {
                                return (
                                  <Badge
                                    variant="outline"
                                    className="bg-rose-50/50 dark:bg-rose-800 text-rose-700 dark:text-white border-rose-800 shadow-none text-[10px]"
                                    title="El efectivo esperado calculado dio negativo"
                                  >
                                    ⚠ Esperado negativo
                                  </Badge>
                                );
                              }
                              if (diferencia === 0) {
                                return (
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-50/50 dark:bg-emerald-800 text-emerald-700 dark:text-white border-emerald-800 shadow-none text-[10px]"
                                  >
                                    Perfecto
                                  </Badge>
                                );
                              }
                              if (diferencia < 0) {
                                return (
                                  <Badge
                                    variant="outline"
                                    className="bg-rose-50/50 dark:bg-rose-100 text-rose-700 border-rose-200 shadow-none text-[10px]"
                                  >
                                    {formatearMoneda(diferencia)}
                                  </Badge>
                                );
                              }
                              return (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-50/50 dark:bg-blue-200 text-blue-700 border-blue-200 shadow-none text-[10px]"
                                >
                                  +{formatearMoneda(diferencia)}
                                </Badge>
                              );
                            })()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground h-8 px-3 cursor-pointer hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTurnoAbierto(h);
                          }}
                        >
                          <FileText className="w-4 h-4 sm:mr-1.5" />
                          <span className="hidden sm:inline">Ver Detalle</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 border-t border-border bg-muted/10">
            <span className="text-xs text-muted-foreground font-medium">
              Mostrando {(paginaActual - 1) * ITEMS_POR_PAGINA + 1} -{" "}
              {Math.min(filteredData.length, paginaActual * ITEMS_POR_PAGINA)}{" "}
              de {filteredData.length} turnos
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 shadow-none cursor-pointer"
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
              </Button>
              <div className="text-xs font-bold px-2 text-foreground">
                {paginaActual} / {totalPaginas}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shadow-none cursor-pointer"
                onClick={() =>
                  setPaginaActual((p) => Math.min(totalPaginas, p + 1))
                }
                disabled={paginaActual === totalPaginas}
              >
                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
