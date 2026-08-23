"use client";

import { useState } from "react";
import type { PuntoMrr } from "@/features/admin/lib/serie-mrr";
// Se importa acá y NO llega por prop: las funciones no cruzan de un Server
// Component a uno de cliente (hay que serializar las props, y una función no
// se serializa). Pasarla reventaba la página entera con un 500.
import { formatearMoneda } from "@/shared/utils/formatters";

export interface PuntoConGastos extends PuntoMrr {
  gastos: number;
}

/**
 * Lo cobrado contra lo gastado, mes a mes.
 *
 * Antes era una sola serie y los gastos vivían en una lista aparte, abajo. El
 * problema de esa separación es que la pregunta real —"¿estoy ganando?"— se
 * respondía comparando a ojo un gráfico con un texto. Acá las dos barras están
 * pegadas y la diferencia se ve sin hacer la cuenta.
 *
 * Ahora SÍ lleva leyenda: con dos series, el color deja de ser decorativo.
 *
 * La escala toma el máximo de las DOS series, no solo el de los ingresos: un
 * mes donde se gastó más de lo que entró tiene que verse, y si la escala la
 * fijara el ingreso, esa barra se saldría del gráfico — que es justo el mes
 * que hay que mirar.
 *
 * SVG a mano y no una librería de charts: son doce meses; traer d3-scale para
 * esto es más código de configuración que de dibujo.
 */
export function MrrChart({ serie }: Readonly<{ serie: PuntoConGastos[] }>) {
  const [activo, setActivo] = useState<number | null>(null);

  const maximo = Math.max(
    ...serie.map((p) => Math.max(p.total, p.gastos)),
    1,
  );
  // Techo redondeado hacia arriba para que la grilla caiga en números limpios
  // y la barra más alta no toque el borde.
  const escala = Math.ceil(maximo / 50_000) * 50_000 || 50_000;

  const ALTO = 200;
  const LINEAS = [0, 0.5, 1];

  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-4">
        <Referencia clase="bg-primary" texto="Cobrado" />
        <Referencia clase="bg-rose-400/70" texto="Gastos" />
      </div>

      <div className="flex gap-3">
        {/* Eje Y: solo tres marcas. Más ticks en un gráfico de doce meses es
            ruido — la grilla está para ubicar, no para leer valores exactos. */}
        <div
          className="flex flex-col justify-between py-1 text-right"
          style={{ height: ALTO }}
        >
          {[...LINEAS].reverse().map((f) => (
            <span
              key={f}
              className="font-mono text-[10px] tabular-nums text-white/30"
            >
              {f === 0 ? "0" : `${Math.round((escala * f) / 1000)}k`}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          {/* Grilla recesiva: hairline sólida, un paso de la superficie. */}
          <div
            className="absolute inset-0 flex flex-col justify-between"
            aria-hidden
          >
            {LINEAS.map((f) => (
              <div key={f} className="h-px w-full bg-white/[0.06]" />
            ))}
          </div>

          <div
            className="relative flex items-end justify-between gap-1.5"
            style={{ height: ALTO }}
          >
            {serie.map((punto, i) => {
              const altoCobrado = (punto.total / escala) * ALTO;
              const altoGastos = (punto.gastos / escala) * ALTO;
              const resaltado = activo === i;
              const margen = punto.total - punto.gastos;

              return (
                <div
                  key={punto.mes}
                  className="group relative flex h-full flex-1 items-end justify-center gap-0.5"
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(null)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  tabIndex={0}
                  // Los tres números van en el nombre accesible: sin esto, la
                  // única forma de leerlos es apuntarle con el mouse.
                  aria-label={`${punto.etiqueta}: cobrado ${formatearMoneda(
                    punto.total,
                  )}, gastos ${formatearMoneda(
                    punto.gastos,
                  )}, margen ${formatearMoneda(margen)}`}
                >
                  <div
                    className={`w-full max-w-3 rounded-t transition-colors ${
                      resaltado ? "bg-primary" : "bg-primary/70"
                    }`}
                    // Piso de 2px: un mes en cero tiene que verse como una
                    // marca al ras, no desaparecer.
                    style={{ height: Math.max(altoCobrado, 2) }}
                  />
                  <div
                    className={`w-full max-w-3 rounded-t transition-colors ${
                      resaltado ? "bg-rose-400" : "bg-rose-400/60"
                    }`}
                    style={{ height: Math.max(altoGastos, 2) }}
                  />

                  {resaltado && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 shadow-xl">
                      <p className="text-[10px] font-medium text-white/50">
                        {punto.etiqueta}
                      </p>
                      <p className="mt-0.5 font-mono text-xs font-semibold text-white tabular-nums">
                        {formatearMoneda(punto.total)}{" "}
                        <span className="font-normal text-white/40">
                          cobrado
                        </span>
                      </p>
                      <p className="font-mono text-xs text-rose-300 tabular-nums">
                        −{formatearMoneda(punto.gastos)}{" "}
                        <span className="font-normal text-white/40">
                          gastos
                        </span>
                      </p>
                      <p
                        className={`mt-1 border-t border-white/10 pt-1 font-mono text-xs font-semibold tabular-nums ${
                          margen >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatearMoneda(margen)}{" "}
                        <span className="font-normal text-white/40">
                          de margen
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-3">
        <div className="w-8" aria-hidden />
        <div className="flex flex-1 justify-between gap-1.5">
          {serie.map((punto, i) => (
            <span
              key={punto.mes}
              className={`flex-1 text-center text-[10px] ${
                activo === i ? "text-white/80" : "text-white/30"
              }`}
            >
              {/* Solo el mes: el año se repite doce veces y no aporta. */}
              {punto.etiqueta.split(" ")[0]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Referencia({
  clase,
  texto,
}: Readonly<{ clase: string; texto: string }>) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-white/40">
      <span className={`size-2 rounded-sm ${clase}`} aria-hidden />
      {texto}
    </span>
  );
}
