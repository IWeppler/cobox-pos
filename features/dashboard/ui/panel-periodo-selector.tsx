"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { PeriodoPanel } from "../lib/periodo-ranges";

const OPCIONES: { value: PeriodoPanel; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta Semana" },
  { value: "mes", label: "Este Mes" },
  { value: "anio", label: "Este Año" },
];

interface PanelPeriodoSelectorProps {
  periodo: PeriodoPanel;
}

/**
 * Gobierna ÚNICAMENTE la zona analítica del panel (KPIs, chart, rankings)
 * — la zona de excepciones/insights es fija y no depende de este selector.
 * Empuja `?periodo=` a la URL (mismo patrón que period-selector.tsx de
 * /reportes) en vez de estado local: mantiene el panel 100% server-rendered.
 *
 * Dos presentaciones de la MISMA opción, elegidas por CSS y no por JS (sin
 * media query en el cliente no hay salto en la hidratación): dropdown en
 * mobile, donde va pegado al título y 4 botones no entran; segmentado en
 * desktop, donde el ancho sobra y ver las 4 opciones de una es mejor.
 */
export function PanelPeriodoSelector({
  periodo,
}: Readonly<PanelPeriodoSelectorProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", value);
    router.push(`/?${params.toString()}`);
  };

  return (
    <>
      <div className="sm:hidden">
        <Select value={periodo} onValueChange={handleChange}>
          <SelectTrigger
            aria-label="Período del panel"
            // El alto lo define `data-[size=default]:h-11` del primitivo (44px,
            // táctil) y sólo se pisa desde `sm`, donde ya no hay dedo. Un `h-8`
            // suelto no alcanzaría: la variante con data-attribute gana por
            // especificidad.
            className="w-auto gap-1 sm:data-[size=default]:h-8 border-border bg-muted/40 px-3 text-xs font-semibold cursor-pointer"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {OPCIONES.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-sm">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden sm:inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
        {OPCIONES.map((op) => (
          <button
            key={op.value}
            type="button"
            onClick={() => handleChange(op.value)}
            className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer ${
              periodo === op.value
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
    </>
  );
}
