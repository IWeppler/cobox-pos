"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useActiveCategories } from "@/features/stock/hooks/use-active-categories";
import type { LineaCarga, LineaCargaNueva } from "../types";

function formatearPrecio(valor: number): string {
  return `$${valor.toLocaleString("es-AR")}`;
}

function totalUnidades(linea: Extract<LineaCargaNueva, { tieneVariantes: true }>) {
  return linea.variantes.reduce(
    (total, v) => total + (Number.parseInt(v.stock, 10) || 0),
    0,
  );
}

interface CargaRapidaListaProps {
  lineas: LineaCarga[];
  onUpdateCantidad: (clienteLineaId: string, cantidad: number) => void;
  onRemove: (clienteLineaId: string) => void;
  onEditarNueva: (linea: LineaCargaNueva) => void;
  onConfirmar: () => void;
  isConfirming: boolean;
}

export function CargaRapidaLista({
  lineas,
  onUpdateCantidad,
  onRemove,
  onEditarNueva,
  onConfirmar,
  isConfirming,
}: Readonly<CargaRapidaListaProps>) {
  const categorias = useActiveCategories();

  if (lineas.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground italic">
          Escaneá o escribí un producto para empezar la carga.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card">
        {lineas.map((linea) => (
          <div
            key={linea.clienteLineaId}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {linea.kind === "EXISTENTE" ? linea.nombreProducto : linea.nombre}
                {linea.kind === "EXISTENTE" &&
                linea.nombreDisplay !== "Único"
                  ? ` · ${linea.nombreDisplay}`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {linea.kind === "EXISTENTE" ? "Ya existe" : "Producto nuevo"}
                {linea.kind === "NUEVA" && linea.marca
                  ? ` · ${linea.marca}`
                  : ""}
                {linea.kind === "NUEVA" && linea.categoriaId
                  ? ` · ${
                      categorias.find((c) => c.id === linea.categoriaId)
                        ?.nombre ?? "categoría"
                    }`
                  : ""}
                {(linea.kind === "EXISTENTE" ? linea.sku : linea.codigo)
                  ? ` · SKU ${linea.kind === "EXISTENTE" ? linea.sku : linea.codigo}`
                  : ""}
                {" · "}
                Costo {formatearPrecio(
                  linea.kind === "EXISTENTE"
                    ? linea.precioCosto
                    : linea.precioCompra,
                )}
                {" · Venta "}
                {formatearPrecio(linea.precioVenta)}
              </p>
            </div>

            {linea.kind === "NUEVA" && linea.tieneVariantes ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3 text-xs font-medium shrink-0"
                onClick={() => onEditarNueva(linea)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                {linea.variantes.length} variante
                {linea.variantes.length === 1 ? "" : "s"} · {totalUnidades(linea)} u.
              </Button>
            ) : (
              <Input
                type="number"
                min={1}
                value={linea.cantidad}
                onChange={(e) =>
                  onUpdateCantidad(
                    linea.clienteLineaId,
                    Number.parseInt(e.target.value, 10),
                  )
                }
                className="w-20 h-9 text-center shrink-0"
              />
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => onRemove(linea.clienteLineaId)}
              aria-label="Quitar línea"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        className="w-full h-12 text-sm font-semibold"
        disabled={isConfirming}
        onClick={onConfirmar}
      >
        {isConfirming
          ? "Confirmando..."
          : `Confirmar carga (${lineas.length} línea${lineas.length === 1 ? "" : "s"})`}
      </Button>
    </div>
  );
}
