"use client";

import { useMemo } from "react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { precioDeLista } from "@/shared/lib/precio-de-lista";
import type { ListaPrecio, TipoReglaListaForm } from "@/entities/precios/types";

/**
 * Los campos de una lista de precios. Los comparten el alta y la edición.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL SIGNO NO SE TIPEA, SE ELIGE
 *
 * `listas_precios.valor` es un número FIRMADO: −20 es 20% menos y +15 es 15%
 * más. Es lo correcto para la base —una lista de crédito sube el precio— pero
 * es una trampa en un formulario: quien quiere "20% menos" escribe 20, y sin
 * el signo la lista SUBIRÍA el precio un 20%. Nadie lo notaría hasta la
 * primera venta.
 *
 * Así que el formulario pregunta la dirección con un selector ("menos" /
 * "más") y un número positivo, y arma el signo al mandar. La base sigue
 * guardando un valor firmado; la persona nunca escribe un menos.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA VISTA PREVIA SALE DE LA MISMA FUNCIÓN QUE COBRA
 *
 * El ejemplo de abajo lo calcula `precioDeLista`, exactamente la misma función
 * que va a usar el POS y que revalida el server. No es una aproximación para
 * mostrar: si acá dice $16.000, el mostrador cobra $16.000. Una vista previa
 * con su propia cuenta sería una promesa que otro código tiene que cumplir.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** El producto de ejemplo de la vista previa. Redondo a propósito: es para
 * entender la regla, no para adivinar un precio del catálogo. */
const EJEMPLO_PRECIO = 20000;
const EJEMPLO_COSTO = 10000;

const pesos = (valor: number) => `$${Math.round(valor).toLocaleString("es-AR")}`;

export interface ValoresLista {
  nombre: string;
  tipoRegla: TipoReglaListaForm;
  /** Siempre POSITIVO. El signo lo pone `direccion`. */
  magnitud: string;
  direccion: "menos" | "mas";
  admitePromociones: boolean;
}

export function valoresDesdeLista(lista?: ListaPrecio | null): ValoresLista {
  if (!lista) {
    return {
      nombre: "",
      tipoRegla: "PORCENTAJE",
      magnitud: "20",
      direccion: "menos",
      admitePromociones: false,
    };
  }

  const valor = Number(lista.valor) || 0;
  return {
    nombre: lista.nombre,
    tipoRegla: lista.tipo_regla === "MARKUP" ? "MARKUP" : "PORCENTAJE",
    magnitud: String(Math.abs(valor)),
    direccion: valor >= 0 ? "mas" : "menos",
    admitePromociones: lista.admite_promociones === true,
  };
}

/** El número firmado que va a la base, armado desde lo que se eligió. */
export function valorFirmado(valores: ValoresLista): number {
  const magnitud = Number(valores.magnitud.replace(",", ".")) || 0;
  if (valores.tipoRegla === "MARKUP") return magnitud;
  return valores.direccion === "menos" ? -magnitud : magnitud;
}

export function ListaPrecioForm({
  valores,
  onChange,
}: Readonly<{
  valores: ValoresLista;
  onChange: (valores: ValoresLista) => void;
}>) {
  const set = <K extends keyof ValoresLista>(
    clave: K,
    valor: ValoresLista[K],
  ) => onChange({ ...valores, [clave]: valor });

  const esMarkup = valores.tipoRegla === "MARKUP";

  const vistaPrevia = useMemo(
    () =>
      precioDeLista({
        precioBase: EJEMPLO_PRECIO,
        precioCosto: EJEMPLO_COSTO,
        lista: {
          tipo_regla: valores.tipoRegla,
          valor: valorFirmado(valores),
          activa: true,
        },
      }),
    [valores],
  );

  return (
    <div className="space-y-5">
      {/* Los campos que van al FormData. El resto son controles visuales. */}
      <input type="hidden" name="tipo_regla" value={valores.tipoRegla} />
      <input type="hidden" name="valor" value={valorFirmado(valores)} />
      <input
        type="hidden"
        name="admite_promociones"
        value={String(valores.admitePromociones)}
      />

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre de la lista</Label>
        <Input
          id="nombre"
          name="nombre"
          value={valores.nombre}
          onChange={(e) => set("nombre", e.target.value)}
          placeholder="Ej: Mayorista, Distribuidor"
          maxLength={60}
          required
          className="rounded-lg shadow-none"
        />
        <p className="text-[10px] text-muted-foreground leading-tight">
          Es el nombre que va a ver la vendedora en el ticket del POS y el que
          queda impreso en las ventas que se cobren con esta lista.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Cómo se calcula el precio</Label>
        <Select
          value={valores.tipoRegla}
          onValueChange={(v) => set("tipoRegla", v as TipoReglaListaForm)}
        >
          <SelectTrigger className="rounded-lg shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PORCENTAJE">
              Un porcentaje sobre el precio de venta
            </SelectItem>
            <SelectItem value="MARKUP">
              Un multiplicador sobre el costo
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {esMarkup ? (
        <div className="space-y-2">
          <Label htmlFor="magnitud">Multiplicador sobre el costo</Label>
          <Input
            id="magnitud"
            type="number"
            min="0"
            step="any"
            value={valores.magnitud}
            onChange={(e) => set("magnitud", e.target.value)}
            required
            className="rounded-lg shadow-none"
          />
          <p className="text-[10px] text-muted-foreground leading-tight">
            2 es el doble del costo, que es como está cargada la mayoría de tu
            catálogo. Los productos que todavía no tienen costo cargado se
            venden a su precio de siempre.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Ajuste sobre el precio de venta</Label>
          <div className="flex gap-2">
            <Select
              value={valores.direccion}
              onValueChange={(v) => set("direccion", v as "menos" | "mas")}
            >
              <SelectTrigger className="rounded-lg shadow-none w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="menos">Menos</SelectItem>
                <SelectItem value="mas">Más</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input
                type="number"
                min="0"
                max="99"
                step="any"
                value={valores.magnitud}
                onChange={(e) => set("magnitud", e.target.value)}
                required
                className="rounded-lg shadow-none pr-7"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VISTA PREVIA — calculada por la misma función que después cobra. */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Con esta regla
        </p>
        <p className="mt-1.5 text-sm">
          Un producto de{" "}
          <span className="font-semibold">{pesos(EJEMPLO_PRECIO)}</span>
          {esMarkup && (
            <span className="text-muted-foreground">
              {" "}
              con {pesos(EJEMPLO_COSTO)} de costo
            </span>
          )}{" "}
          se vende a{" "}
          <span className="font-bold text-foreground">
            {pesos(vistaPrevia.precio)}
          </span>
          .
        </p>
        {vistaPrevia.origen === "base" && (
          <p className="mt-1 text-[11px] text-warning">
            Con estos valores la lista no cambiaría ningún precio.
          </p>
        )}
      </div>

      {/* ACUMULACIÓN CON PROMOCIONES */}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="min-w-0">
          <Label className="text-sm">Permitir promociones encima</Label>
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
            Apagado, una venta con esta lista no toma promociones: el precio de
            lista ya es el descuento. Prendido, se suman las dos —una lista de
            20% menos más una promo de 10% deja el producto un 28% abajo.
          </p>
        </div>
        <Switch
          checked={valores.admitePromociones}
          onCheckedChange={(v) => set("admitePromociones", v)}
        />
      </div>
    </div>
  );
}
