"use client";

import type { NivelScoring, ScoringCliente } from "../lib/scoring-cliente";

const COLOR_TEXTO: Record<NivelScoring, string> = {
  excelente: "text-emerald-600",
  bueno: "text-sky-600",
  regular: "text-amber-600",
  riesgoso: "text-rose-600",
};

const COLOR_BARRA: Record<NivelScoring, string> = {
  excelente: "bg-emerald-500",
  bueno: "bg-sky-500",
  regular: "bg-amber-500",
  riesgoso: "bg-rose-500",
};

const ETIQUETA: Record<NivelScoring, string> = {
  excelente: "Le fiás tranquilo",
  bueno: "Buen pagador",
  regular: "Se atrasa a veces",
  riesgoso: "Ojo con fiarle",
};

/**
 * El scoring del cliente: un número y una barra.
 *
 * Sin recuadro y sin ícono a propósito. Un badge de color en cada fila
 * convierte la columna en un semáforo que compite con el estado del cliente
 * —que ya está al lado y ya es un badge— y la tabla termina con dos
 * indicadores discutiendo. Acá el número es el dato y la barra es la lectura
 * rápida; el color los une sin agregar una tercera forma.
 *
 * La barra sirve además para lo que un número solo no muestra: 78 y 82 se leen
 * casi iguales en texto, y a lo largo de una columna las barras hacen evidente
 * quién está abajo.
 */
export function ScoringBadges({
  scoring,
}: Readonly<{ scoring: ScoringCliente }>) {
  const detalle = [
    ETIQUETA[scoring.nivel],
    ...scoring.factores,
    scoring.episodios > 0
      ? `Sobre ${scoring.episodios} cuenta${scoring.episodios === 1 ? "" : "s"} cerrada${scoring.episodios === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex w-16 flex-col gap-1" title={detalle}>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono text-sm font-bold tabular-nums ${COLOR_TEXTO[scoring.nivel]}`}
        >
          {scoring.puntaje}
        </span>
        {/* El denominador en gris y chico: da la escala sin competir con el
            número, que es lo único que se compara entre filas. */}
        <span className="text-[9px] text-muted-foreground/50">/100</span>
      </div>

      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={scoring.puntaje}
        aria-valuemin={1}
        aria-valuemax={100}
        aria-label={`Scoring: ${detalle}`}
      >
        <div
          className={`h-full rounded-full ${COLOR_BARRA[scoring.nivel]}`}
          style={{ width: `${scoring.puntaje}%` }}
        />
      </div>
    </div>
  );
}
