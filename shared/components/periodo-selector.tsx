"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type {
  PeriodoCalendario,
  PeriodoPanel,
} from "@/shared/lib/periodo-ranges";

export type OpcionPeriodo<T extends string> = { value: T; label: string };

/** /caja: períodos de CALENDARIO, que es lo que entiende su RPC. */
export const OPCIONES_CALENDARIO: OpcionPeriodo<PeriodoCalendario>[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta Semana" },
  { value: "mes", label: "Este Mes" },
  { value: "anio", label: "Este Año" },
];

/** Panel: ventanas MÓVILES. Los nombres son los de siempre porque es como se
 * habla del período; el largo exacto vive en DIAS_POR_PERIODO. */
export const OPCIONES_PANEL: OpcionPeriodo<PeriodoPanel>[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anio", label: "Año" },
];

interface PeriodoSelectorProps<T extends string> {
  periodo: T;
  /** Qué períodos ofrece esta superficie. No hay default a propósito: el
   * panel y la caja hablan vocabularios distintos y confundirlos manda un
   * período móvil a una RPC que espera calendario. */
  opciones: OpcionPeriodo<T>[];
  /** Con onChange el selector es controlado y NO toca la URL. Sin él empuja
   * `?periodo=` a la ruta actual, que es lo que mantiene el panel
   * server-rendered. La caja lo usa controlado: ahí el período gobierna una
   * sola tarjeta y recargar la página entera sería tirar el estado de las
   * otras tabs. */
  onChange?: (periodo: T) => void;
  ariaLabel?: string;
}

/**
 * Selector de período, compartido por el panel y la caja. Cada superficie le
 * pasa SUS opciones: la caja usa períodos de calendario (los únicos que
 * entiende su RPC) y el panel ventanas móviles. La semántica de los rangos
 * vive en shared/lib/periodo-ranges.ts — acá solo está la presentación.
 *
 * En el panel gobierna ÚNICAMENTE la zona analítica (KPIs, chart, rankings)
 * — la zona de excepciones/insights es fija y no depende de este selector.
 * Empuja `?periodo=` a la URL (mismo patrón que period-selector.tsx de
 * /reportes) en vez de estado local: mantiene el panel 100% server-rendered.
 *
 * Dos presentaciones de la MISMA opción, elegidas por CSS y no por JS (sin
 * media query en el cliente no hay salto en la hidratación): dropdown en
 * mobile, donde va pegado al título y los botones no entran; segmentado en
 * desktop, donde el ancho sobra y ver todas las opciones de una es mejor.
 */
export function PeriodoSelector<T extends string>({
  periodo,
  opciones,
  onChange,
  ariaLabel = "Período",
}: Readonly<PeriodoSelectorProps<T>>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (value: string) => {
    if (onChange) {
      onChange(value as T);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <div className="sm:hidden">
        <Select value={periodo} onValueChange={handleChange}>
          <SelectTrigger
            aria-label={ariaLabel}
            // El alto lo define `data-[size=default]:h-11` del primitivo (44px,
            // táctil) y sólo se pisa desde `sm`, donde ya no hay dedo. Un `h-8`
            // suelto no alcanzaría: la variante con data-attribute gana por
            // especificidad.
            className="w-auto gap-1 sm:data-[size=default]:h-8 border-border bg-muted/40 px-3 text-xs font-semibold cursor-pointer"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {opciones.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-sm">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden sm:inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
        {opciones.map((op) => (
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
