import { useState } from "react";
import { Receipt } from "lucide-react";
import { MarcaCombobox } from "./marca-combobox";
import {
  etiquetaMarca,
  rubroUsaMarca,
} from "@/features/stock/lib/marca-por-rubro";
import type { Rubro } from "@/entities/config/types";
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
  marcaActual?: string | null;
  /** Rubro del comercio: decide si la marca se ofrece siempre y cómo se llama
   * (en farmacia, "Laboratorio"). */
  rubro?: Rubro;
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
 * Marca y género no son datos fiscales (no salen en ninguna factura) y por eso
 * el alta no los muestra: pedirle a quien viene a tocar una alícuota que
 * además clasifique el producto es la forma de que no haga ninguna de las dos.
 * En la EDICIÓN aparecen en dos casos:
 *
 * 1. El producto ya trae alguno cargado —entró por planilla o por el catálogo
 *    maestro—: sacarles la única pantalla donde se corrigen los volvería
 *    incorregibles.
 * 2. El rubro usa la marca como identidad (`rubroUsaMarca`): en un kiosco
 *    "Yerba Del Monte" y "Yerba La Merced" son dos productos que el nombre
 *    solo no distingue, así que el campo tiene que estar aunque venga vacío.
 *
 * En indumentaria y electro se mantiene solo el caso 1: ahí la prenda se
 * identifica por talle/color y el aparato por modelo + EAN.
 */
export function ProductFiscalSection({
  defaults,
  tratamientoActual,
  unidadActual,
  generoActual,
  marcaActual,
  rubro,
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

  // Solo si el producto YA los trae: en el alta estas props ni se pasan, así
  // que el bloque no existe. Se muestra el par completo aunque solo uno tenga
  // valor — si aparece "Marca" sola, el que edita no tiene forma de saber que
  // género también se puede corregir ahí.
  const tieneIdentidadCargada = Boolean(
    (marcaActual ?? "").trim() || (generoActual ?? "").trim(),
  );

  // En los rubros donde la marca ES la identidad del producto —kiosco,
  // alimentos, farmacia, ferretería— el campo aparece aunque esté vacío: "Yerba
  // Del Monte" y "Yerba La Merced" no se distinguen por el nombre. En los
  // demás se mantiene la regla de antes (solo si el producto ya la trae), que
  // es lo que evita empujar un dato que ese rubro no usa: Evens tiene 1.171
  // productos y cero marcas.
  const usaMarca = rubro ? rubroUsaMarca(rubro) : false;
  const mostrarBloqueIdentidad = tieneIdentidadCargada || usaMarca;

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
                {usaMarca
                  ? `${etiquetaMarca(rubro!)} y género no son datos fiscales, pero identifican al producto en el buscador del POS.`
                  : "Este producto trae marca y género de una importación. No son datos fiscales — se pueden corregir o vaciar acá, y de ahora en más se cargan como propiedad en Variantes."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
                <MarcaCombobox
                  etiqueta={rubro ? etiquetaMarca(rubro) : "Marca"}
                  valorInicial={marcaActual}
                />

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
