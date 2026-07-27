"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { PeriodoPanel } from "../lib/periodo-ranges";

const OPCIONES: { value: PeriodoPanel; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Esta Semana" },
  { value: "mes", label: "Este Mes" },
];

interface PanelPeriodoSelectorProps {
  periodo: PeriodoPanel;
}

/**
 * Gobierna ÚNICAMENTE la zona analítica del panel (héroe, chart, rankings)
 * — la zona de excepciones/insights es fija y no depende de este selector.
 * Empuja `?periodo=` a la URL (mismo patrón que period-selector.tsx de
 * /reportes) en vez de estado local: mantiene el panel 100% server-rendered.
 */
export function PanelPeriodoSelector({
  periodo,
}: Readonly<PanelPeriodoSelectorProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: PeriodoPanel) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", value);
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
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
  );
}
