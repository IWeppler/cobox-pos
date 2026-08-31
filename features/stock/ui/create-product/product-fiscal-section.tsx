import { useState } from "react";
import { Receipt } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  defaultsFiscalesPorRubro,
  DEFINICION_TRATAMIENTO_IVA,
  ETIQUETA_UNIDAD,
  normalizarTratamientoIva,
  normalizarUnidadMedida,
  TRATAMIENTOS_IVA,
  UNIDADES_MEDIDA,
  type DefaultsFiscales,
} from "@/shared/lib/fiscal-producto";

type ProductFiscalSectionProps = {
  /** Con qué nace el producto según el rubro del comercio. Solo aplica en el
   * alta: en la edición el producto ya tiene sus valores y mandan ellos. */
  defaults?: DefaultsFiscales;
  /** Valores ya guardados (edición). Ausentes en el alta. */
  tratamientoActual?: string | null;
  unidadActual?: string | null;
  generoActual?: string | null;
};

/**
 * Datos fiscales del producto: tratamiento de IVA y unidad de medida.
 *
 * Va COLAPSADA y es lo último del formulario a propósito: el 99% de las altas
 * no tiene que ver nada de esto. Una vendedora carga nombre y precio, el
 * producto nace con los defaults del rubro y queda bien cargado. Poner una
 * alícuota de IVA arriba de "Nombre" es la forma más rápida de que nadie
 * cargue productos.
 *
 * Cuando está cerrada NO monta los inputs, y eso es deliberado: las actions
 * miran `formData.has(...)`, así que un campo que no se muestra tampoco se
 * pisa. Un producto al 10,5% sigue al 10,5% después de que alguien le corrija
 * el precio desde la edición rápida.
 *
 * El GÉNERO tampoco es un dato fiscal (no sale en ninguna factura) y sigue
 * acá por una razón acotada: es un campo legacy que traen los productos
 * importados por planilla o desde el catálogo maestro, y esta es la única
 * pantalla donde se corrige. Por eso aparece SOLO si el producto ya lo trae
 * cargado; de ahora en más el género se carga como propiedad en Variantes.
 *
 * La MARCA se fue de acá: vive arriba, junto al nombre y al código, en el
 * bloque de datos básicos. Estaba enterrada en una sección colapsada que el
 * alta ni siquiera muestra, así que un producto se creaba con marca y después
 * no había dónde corregirla.
 */
export function ProductFiscalSection({
  defaults,
  tratamientoActual,
  unidadActual,
  generoActual,
}: ProductFiscalSectionProps) {
  const [abierta, setAbierta] = useState(false);

  // En el alta no hay valores guardados: manda el default del rubro. En la
  // edición manda lo que tiene el producto. Se normaliza en los dos casos para
  // que un valor viejo o desconocido no rompa el Select.
  const base = defaults ?? defaultsFiscalesPorRubro(undefined);
  const tratamiento = normalizarTratamientoIva(
    tratamientoActual ?? base.tratamiento_iva,
  );
  const unidad = normalizarUnidadMedida(unidadActual ?? base.unidad_medida);

  const resumen = `${ETIQUETA_UNIDAD[unidad]} · IVA ${DEFINICION_TRATAMIENTO_IVA[tratamiento].label}`;

  // Solo si el producto YA lo trae: en el alta esta prop ni se pasa, así que
  // el bloque no existe y nadie carga un género nuevo desde acá.
  const mostrarBloqueIdentidad = Boolean((generoActual ?? "").trim());

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden transition-all">
      <div
        className="flex items-center justify-between p-3 md:p-5 cursor-pointer"
        onClick={() => setAbierta(true)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted/30 rounded-md border border-border/50">
            <Receipt className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm">Datos fiscales</p>
            {!abierta && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {resumen}
              </p>
            )}
          </div>
        </div>
        {!abierta && (
          <Button
            type="button"
            variant="ghost"
            className="font-bold text-foreground hover:bg-muted shadow-none h-8 text-sm px-3"
            onClick={(e) => {
              e.stopPropagation();
              setAbierta(true);
            }}
          >
            Modificar
          </Button>
        )}
      </div>

      {abierta && (
        <div className="px-2 md:px-5 pb-5 pt-2 animate-in fade-in slide-in-from-top-2 border-t border-border/50 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Tratamiento de IVA
              </Label>
              <Select name="tratamiento_iva" defaultValue={tratamiento}>
                <SelectTrigger className="h-10 shadow-none rounded-lg bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRATAMIENTOS_IVA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DEFINICION_TRATAMIENTO_IVA[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Solo se usa al facturar. El precio de venta no cambia.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Unidad de medida
              </Label>
              <Select name="unidad_medida" defaultValue={unidad}>
                <SelectTrigger className="h-10 shadow-none rounded-lg bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIDADES_MEDIDA.map((u) => (
                    <SelectItem key={u} value={u}>
                      {ETIQUETA_UNIDAD[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          {mostrarBloqueIdentidad && (
            <div className="mt-5 border-t border-border/50 pt-4">
              <p className="text-[11px] text-muted-foreground">
                Este producto trae género de una importación. No es un dato
                fiscal — se puede corregir o vaciar acá, y de ahora en más se
                carga como propiedad en Variantes.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Género
                  </Label>
                  <Input
                    name="genero"
                    defaultValue={generoActual ?? ""}
                    placeholder="Ej: Mujer, Hombre, Unisex"
                    className="h-10 shadow-none rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
