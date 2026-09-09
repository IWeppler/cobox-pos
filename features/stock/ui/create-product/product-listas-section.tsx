"use client";

import { useState } from "react";
import { Tags } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useListasPrecios } from "@/shared/hooks/use-listas-precios";
import { precioDeLista } from "@/shared/lib/precio-de-lista";

/**
 * Precio FIJO de este producto en cada lista: la excepción a la regla.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VACÍO ES LO NORMAL, Y ES LO QUE TIENE QUE SEGUIR SIENDO
 *
 * El sentido de que una lista tenga REGLA es que el comercio cargue un número
 * una vez y tenga precios mayoristas sobre el catálogo entero. Un override es
 * para la prenda que no sigue esa regla, y si hubiera que cargar uno por
 * producto la lista no serviría para nada.
 *
 * Por eso cada fila muestra, arriba del input, lo que la REGLA daría: el campo
 * vacío no es un dato faltante, es "seguí la regla". El placeholder dice ese
 * número.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * COLAPSADA Y SIN MONTAR SUS INPUTS cuando está cerrada, igual que el bloque
 * fiscal. Las actions miran `formData.has(...)`, así que corregir el precio de
 * un producto desde la edición rápida NO puede borrarle sus precios fijos.
 * Es el mismo mecanismo que evita que un producto al 10,5% vuelva al 21%.
 *
 * NO SE DIBUJA si el comercio no tiene listas, que son 7 de los 8.
 */
export function ProductListasSection({
  productoId,
  precioVenta,
  precioCosto,
}: Readonly<{
  /** Ausente en el ALTA: sin producto todavía no hay a qué colgarle un precio
   * fijo. La sección aparece al volver a abrirlo para editarlo. */
  productoId?: string;
  /** Lo que se está por guardar, para que el ejemplo de la regla sea el de
   * ESTE producto y no uno inventado. */
  precioVenta: string;
  precioCosto: string;
}>) {
  const [abierta, setAbierta] = useState(false);
  const { listas, overrides } = useListasPrecios();

  if (listas.length === 0 || !productoId) return null;

  const base = Number(precioVenta) || 0;
  const costo = Number(precioCosto) || 0;

  const conOverride = listas.filter(
    (lista) => (overrides[lista.id]?.[productoId] ?? 0) > 0,
  ).length;

  return (
    <div className="rounded-xl border border-border">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setAbierta((v) => !v)}
        className="flex h-auto w-full items-center justify-between px-4 py-3 hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Tags className="h-4 w-4 text-muted-foreground" />
          Precios por lista
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {conOverride > 0
            ? `${conOverride} con precio fijo`
            : "Siguen la regla de cada lista"}
        </span>
      </Button>

      {abierta && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {/* Centinela: le dice a la action que este formulario SÍ trae los
              precios por lista. Sin él no se toca ninguno. */}
          <input type="hidden" name="precios_lista_editables" value="1" />

          {listas.map((lista) => {
            const porRegla = precioDeLista({
              precioBase: base,
              precioCosto: costo,
              lista: { ...lista, activa: true },
            });
            const actual = overrides[lista.id]?.[productoId];

            return (
              <div key={lista.id} className="space-y-1.5">
                <Label
                  htmlFor={`precio-lista-${lista.id}`}
                  className="text-sm font-medium"
                >
                  {lista.nombre}
                </Label>
                <Input
                  id={`precio-lista-${lista.id}`}
                  name={`precio_lista_${lista.id}`}
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={actual ?? ""}
                  placeholder={
                    porRegla.origen === "regla"
                      ? `${porRegla.precio} (por la regla de la lista)`
                      : "Sin regla aplicable: usa el precio de venta"
                  }
                  className="rounded-lg shadow-none"
                />
                <p className="text-[10px] leading-tight text-muted-foreground">
                  {actual
                    ? "Este producto tiene precio fijo en esta lista. Vaciá el campo para que vuelva a seguir la regla."
                    : "Vacío: sigue la regla de la lista. Poné un número solo si este producto es la excepción."}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
