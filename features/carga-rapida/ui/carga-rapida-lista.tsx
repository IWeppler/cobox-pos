"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useActiveCategories } from "@/features/stock/hooks/use-active-categories";
import { esNombreVarianteUnica } from "@/features/stock/utils/parse-legacy-variant";
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

/** Unidades de una línea con la variante ya resuelta por el maestro: hay una
 * sola combinación, así que su stock ES la cantidad de la línea. */
function stockVarianteFija(
  linea: Extract<LineaCargaNueva, { tieneVariantes: true }>,
): number {
  return Number.parseInt(linea.variantes[0]?.stock ?? "0", 10) || 0;
}

/** Input chico con label arriba, para editar precio/cantidad sin salir de la
 * fila. `value` 0 se muestra vacío: un "0" precargado invita a tipear al lado
 * y terminar cargando 0500. */
function CampoInline({
  label,
  value,
  onChange,
  invalido,
  entero,
}: Readonly<{
  label: string;
  value: number;
  onChange: (valor: number) => void;
  invalido?: boolean;
  entero?: boolean;
}>) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Input
        type="number"
        min={entero ? 1 : 0}
        step={entero ? 1 : "any"}
        value={value > 0 ? value : ""}
        placeholder="0"
        onChange={(e) => {
          const crudo = e.target.value;
          const parseado = entero
            ? Number.parseInt(crudo, 10)
            : Number.parseFloat(crudo);
          onChange(Number.isNaN(parseado) ? 0 : parseado);
        }}
        className={`w-20 h-9 text-center ${
          invalido ? "border-destructive focus-visible:ring-destructive" : ""
        }`}
      />
    </label>
  );
}

interface CargaRapidaListaProps {
  lineas: LineaCarga[];
  onUpdateCantidad: (clienteLineaId: string, cantidad: number) => void;
  onUpdatePrecio: (
    clienteLineaId: string,
    campo: "precioCompra" | "precioVenta",
    valor: number,
  ) => void;
  onRemove: (clienteLineaId: string) => void;
  onEditarNueva: (linea: LineaCargaNueva) => void;
  onConfirmar: () => void;
  isConfirming: boolean;
}

export function CargaRapidaLista({
  lineas,
  onUpdateCantidad,
  onUpdatePrecio,
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
        {lineas.map((linea) => {
          // Variante ya resuelta por el maestro: no hay matriz que editar, se
          // carga precio y cantidad acá mismo.
          const varianteFija =
            linea.kind === "NUEVA" &&
            linea.tieneVariantes &&
            linea.varianteFijaLabel
              ? linea
              : null;

          // Producto nuevo simple: precio y cantidad se cargan acá mismo. Es
          // el caso de la card "crear" del POS, donde la línea nace sin nada
          // más que el nombre y hay que poder cobrarla en dos toques.
          const nuevaSimple =
            linea.kind === "NUEVA" && !linea.tieneVariantes ? linea : null;
          const editableInline = varianteFija ?? nuevaSimple;

          return (
          <div
            key={linea.clienteLineaId}
            className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {linea.kind === "EXISTENTE" ? linea.nombreProducto : linea.nombre}
                {/* Mismo criterio que el formulario de edición: el
                    placeholder se escribe "Único" o "Unico" según por dónde
                    entró el producto, y en los dos casos no es una variante
                    que valga la pena mostrar. */}
                {linea.kind === "EXISTENTE" &&
                !esNombreVarianteUnica(linea.nombreDisplay)
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
                {/* Si los precios son inputs acá al lado, repetirlos como
                    texto sería ruido. */}
                {editableInline ? null : (
                  <>
                    {" · "}
                    Costo {formatearPrecio(
                      linea.kind === "EXISTENTE"
                        ? linea.precioCosto
                        : linea.precioCompra,
                    )}
                    {" · Venta "}
                    {formatearPrecio(linea.precioVenta)}
                  </>
                )}
              </p>

              {varianteFija ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    title="Variante definida por el Catálogo Maestro"
                    className="text-[10px] uppercase font-medium tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border/50"
                  >
                    {varianteFija.varianteFijaLabel}
                  </span>
                  {/* Escape para el caso raro: el maestro trae el dato
                      incompleto o mal cargado y hay que corregir la grilla. */}
                  <button
                    type="button"
                    onClick={() => onEditarNueva(varianteFija)}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
                  >
                    editar variante
                  </button>
                </div>
              ) : null}
            </div>

            {editableInline ? (
              <div className="flex items-end gap-2 shrink-0">
                {/* El costo NO se marca inválido: es opcional a propósito
                    (ver validarLinea). Lo que sí queda en rojo hasta cargarse
                    es la venta, que es lo único sin lo que no se puede
                    cobrar, y la cantidad. */}
                <CampoInline
                  label="Costo"
                  value={editableInline.precioCompra}
                  onChange={(v) =>
                    onUpdatePrecio(linea.clienteLineaId, "precioCompra", v)
                  }
                />
                <CampoInline
                  label="Venta"
                  value={editableInline.precioVenta}
                  invalido={editableInline.precioVenta <= 0}
                  onChange={(v) =>
                    onUpdatePrecio(linea.clienteLineaId, "precioVenta", v)
                  }
                />
                <CampoInline
                  label="Cant."
                  value={
                    varianteFija
                      ? stockVarianteFija(varianteFija)
                      : nuevaSimple!.cantidad
                  }
                  entero
                  invalido={
                    (varianteFija
                      ? stockVarianteFija(varianteFija)
                      : nuevaSimple!.cantidad) <= 0
                  }
                  onChange={(v) => onUpdateCantidad(linea.clienteLineaId, v)}
                />
              </div>
            ) : linea.kind === "NUEVA" && linea.tieneVariantes ? (
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
          );
        })}
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
