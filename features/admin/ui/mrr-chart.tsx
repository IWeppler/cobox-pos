"use client";

import { useState } from "react";
import type { PuntoMrr } from "@/features/admin/lib/serie-mrr";
// Se importa acá y NO llega por prop: las funciones no cruzan de un Server
// Component a uno de cliente (hay que serializar las props, y una función no
// se serializa). Pasarla reventaba la página entera con un 500.
import { formatearMoneda } from "@/shared/utils/formatters";

/**
 * Ingresos cobrados por mes.
 *
 * Una sola serie, así que NO lleva leyenda: el título ya dice qué se está
 * mirando y un recuadro con un solo cuadradito de color solo repite el título.
 *
 * Los meses en cero se dibujan igual (como un tick al ras de la base) en vez de
 * omitirse: un hueco en la serie se lee como "falta el dato", y un mes sin
 * cobrar es justamente el dato que hay que ver.
 *
 * SVG a mano y no una librería de charts: son doce barras: traer d3-scale para
 * esto es más código de configuración que de dibujo.
 */
export function MrrChart({ serie }: Readonly<{ serie: PuntoMrr[] }>) {
  const [activo, setActivo] = useState<number | null>(null);

  const maximo = Math.max(...serie.map((p) => p.total), 1);
  // Techo redondeado hacia arriba para que la grilla caiga en números limpios
  // y la barra más alta no toque el borde.
  const escala = Math.ceil(maximo / 50_000) * 50_000 || 50_000;

  const ALTO = 200;
  const LINEAS = [0, 0.5, 1];

  return (
    <div className="relative">
      <div className="flex gap-3">
        {/* Eje Y: solo tres marcas. Más ticks en un gráfico de doce barras es
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
              const alto = (punto.total / escala) * ALTO;
              const resaltado = activo === i;

              return (
                <div
                  key={punto.mes}
                  className="group relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(null)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  tabIndex={0}
                  // El mes y el monto van en el nombre accesible: sin esto, la
                  // única forma de leer el valor es apuntarle con el mouse.
                  aria-label={`${punto.etiqueta}: ${formatearMoneda(punto.total)}`}
                >
                  <div
                    className={`w-full max-w-6 rounded-t transition-colors ${
                      resaltado ? "bg-primary" : "bg-primary/70"
                    }`}
                    // Piso de 2px: un mes en cero tiene que verse como una
                    // marca al ras, no desaparecer.
                    style={{ height: Math.max(alto, 2) }}
                  />

                  {resaltado && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 shadow-xl">
                      <p className="font-mono text-xs font-semibold text-white tabular-nums">
                        {formatearMoneda(punto.total)}
                      </p>
                      <p className="text-[10px] text-white/50">
                        {punto.etiqueta} ·{" "}
                        {punto.pagos === 0
                          ? "sin cobros"
                          : `${punto.pagos} cobro${punto.pagos === 1 ? "" : "s"}`}
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
