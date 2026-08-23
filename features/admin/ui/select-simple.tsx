"use client";

import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { CLASE_PORTAL_OSCURO } from "@/features/admin/lib/tema-portal";

export interface OpcionSelect {
  valor: string;
  etiqueta: string;
}

/**
 * Un `Select` de shadcn con su etiqueta, para los formularios del panel.
 *
 * Reemplaza a los `<select>` nativos que había en los modales. El nativo se
 * veía distinto en cada sistema operativo y, sobre todo, no tomaba el tema:
 * en un panel oscuro aparecía la lista blanca del navegador.
 *
 * OJO CON LOS FORMULARIOS: el Select de Radix NO es un `<select>`, así que no
 * aporta nada al `FormData`. Quien lo use tiene que llevar el valor en estado
 * y mandarlo con un `<input type="hidden">`. Ese es el precio de dejar el
 * nativo, y es la parte que se olvida.
 *
 * El `dark` del contenido va sí o sí: Radix lo monta en un portal colgado de
 * `document.body`, fuera del contenedor que fuerza el tema (ver
 * `tema-portal.ts`).
 */
export function SelectSimple({
  id,
  etiqueta,
  valor,
  onChange,
  opciones,
  deshabilitado,
}: Readonly<{
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: OpcionSelect[];
  deshabilitado?: boolean;
}>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select value={valor} onValueChange={onChange} disabled={deshabilitado}>
        <SelectTrigger id={id} className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={CLASE_PORTAL_OSCURO}>
          {opciones.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
